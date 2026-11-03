"""Router: selection, two-phase stream, breaker.

Reservation (not read-modify-write). Phase 1 hops freely; phase 2 never hops.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from datetime import datetime, timezone, timedelta
from typing import AsyncIterator, Callable

from .config import Config
from .leases import Lease, LeaseStore

log = logging.getLogger(__name__)


class AllLanesDry(Exception):
    """No eligible lease anywhere."""


class UpstreamBadRequest(Exception):
    """400 from upstream — do not retry."""


def next_reset_utc(now: float | None = None) -> float:
    """Next 12:01:00 UTC. Never returns a past timestamp."""
    now = now if now is not None else time.time()
    dt = datetime.fromtimestamp(now, tz=timezone.utc)
    candidate = dt.replace(hour=12, minute=1, second=0, microsecond=0)
    if candidate.timestamp() <= now:
        candidate += timedelta(days=1)
    return candidate.timestamp()


class Router:
    def __init__(
        self,
        store: LeaseStore,
        config: Config,
        transport: Callable | None = None,
    ):
        self.store = store
        self.config = config
        self.transport = transport  # async gen (lease, body) -> deltas; None = real dispatch
        self._sem = asyncio.Semaphore(config.max_concurrency)
        self._breaker_until: float = 0.0
        self._recent_failures: list[bool] = []  # last 20 outcomes
        self._current: Lease | None = None
        self._pool = None  # lazy AttestationPool for the real transport

    def _lane_rank(self, kind: str) -> int:
        try:
            return self.config.lane_order.index(kind)
        except ValueError:
            return 99

    def _ordered_eligible(self, eligible: list[Lease]) -> list[Lease]:
        """Iterate lane_order outer, then budget DESC, last_used ASC within a lane."""
        order = self.config.lane_order
        eligible = [l for l in eligible if l.kind in order]
        if self.config.browser_hold_reserve:
            non_browser = [l for l in eligible if l.kind != "browser"]
            if non_browser:
                eligible = non_browser
        for kind in order:
            group = [l for l in eligible if l.kind == kind]
            if group:
                group.sort(key=lambda l: (-l.budget, l.last_used))
                return group
        return []

    async def acquire(self, tried: set[int]) -> Lease | None:
        """Select and reserve a lease. Reactivates expired leases first.

        Iterative: a lost reservation retries without growing the stack.
        """
        while True:
            now = time.time()
            await self.store.reactivate(now)

            eligible = await self.store.list_eligible(now, exclude=tried)
            pool = self._ordered_eligible(eligible)
            candidate = pool[0] if pool else None
            current = self._current
            chosen = None

            if current is not None and current.id not in tried:
                cur_fresh = await self.store.get(current.id)
                usable = (
                    cur_fresh is not None
                    and cur_fresh.quarantined_until <= now
                    and (cur_fresh.budget > 0 or cur_fresh.kind == "foreign")
                )
                if usable and cur_fresh is not None:
                    if candidate is None:
                        chosen = cur_fresh
                    elif self._lane_rank(cur_fresh.kind) > self._lane_rank(candidate.kind):
                        chosen = candidate
                    elif cur_fresh.budget <= 1:
                        chosen = candidate
                    else:
                        chosen = cur_fresh
                else:
                    chosen = candidate
            else:
                chosen = candidate

            if chosen is None:
                return None

            ok = await self.store.reserve(chosen.id, now)
            if not ok:
                tried.add(chosen.id)
                continue

            if chosen.last_used > 0:
                elapsed = now - chosen.last_used
                if elapsed < self.config.per_ip_pace_s:
                    sleep_for = (self.config.per_ip_pace_s - elapsed) + random.uniform(
                        self.config.jitter_ms[0] / 1000.0,
                        self.config.jitter_ms[1] / 1000.0,
                    )
                    await asyncio.sleep(sleep_for)

            self._current = chosen
            return chosen

    async def complete(self, body: dict, stream: bool) -> AsyncIterator[bytes]:
        """Two-phase stream. Phase 1 hops freely; phase 2 never hops."""
        # Breaker check
        now = time.time()
        if self._breaker_until > now:
            raise AllLanesDry()
        if len(self._recent_failures) >= 20 and all(self._recent_failures[-20:]):
            self._breaker_until = now + self.config.breaker_cooldown_s
            self._recent_failures.clear()
            raise AllLanesDry()

        async with self._sem:
            async for chunk in self._complete_inner(body, stream):
                yield chunk

    async def _complete_inner(self, body: dict, stream: bool) -> AsyncIterator[bytes]:
        tried: set[int] = set()
        eligible_at_start = await self.store.list_eligible(time.time())
        # A 429 must be able to walk every identity, not stop at max_tries.
        # Other failures stay bounded by max_tries.
        hard_cap = max(self.config.max_tries, len(eligible_at_start), 1)
        attempts = 0
        rate_hops = 0
        emitted_any = False
        collected: list[str] = []

        while attempts < hard_cap:
            lease = await self.acquire(tried)
            if lease is None:
                raise AllLanesDry()
            tried.add(lease.id)
            attempts += 1

            try:
                transport = self.transport or self._real_transport
                first_byte = True
                async def bounded():
                    async for d in transport(lease, body):
                        yield d

                gen = bounded()
                # Phase 1: wait for first delta with ttfb timeout
                try:
                    first = await asyncio.wait_for(gen.__anext__(), timeout=self.config.ttfb_timeout_s)
                except StopAsyncIteration:
                    # empty stream
                    await self.store.record_ok(lease.id)
                    self._note_outcome(True)
                    if not stream:
                        yield self._completion_json(body, "", "stop", lease.kind)
                    else:
                        yield b"data: [DONE]\n\n"
                    return
                except asyncio.TimeoutError:
                    # TTFB timeout → hop (phase 1)
                    await self.store.refund(lease.id)
                    await self.store.record_fail(lease.id)
                    self._note_outcome(False)
                    continue

                # Got first delta — phase 2 begins
                emitted_any = True
                collected.append(first)
                if stream:
                    yield self._chunk_json(first, lease.kind)

                async for delta in gen:
                    collected.append(delta)
                    if stream:
                        yield self._chunk_json(delta, lease.kind)

                # Success — one write: count, reconcile remaining, record future reset
                remaining = getattr(lease, "_rate_remaining", None)
                reset = getattr(lease, "_rate_reset", None)
                await self.store.finish_ok(lease.id, remaining, reset)
                self._note_outcome(True)

                full = "".join(collected)
                if stream:
                    yield b"data: [DONE]\n\n"
                else:
                    yield self._completion_json(body, full, "stop", lease.kind)
                return

            except UpstreamBadRequest:
                await self.store.refund(lease.id)
                raise
            except Exception as exc:
                status = getattr(exc, "status", None)
                body_text = getattr(exc, "body", "") or str(exc)

                if emitted_any:
                    # Phase 2: do not hop. Emit DONE + truncated comment.
                    await self.store.record_fail(lease.id)
                    strikes = await self.store.add_strike(lease.id)
                    if strikes >= self.config.max_strikes:
                        await self.store.set_quarantine(lease.id, next_reset_utc())
                    self._note_outcome(False)
                    if stream:
                        yield b"data: [DONE]\n\n"
                        yield b": venice-lane: truncated upstream\n\n"
                    else:
                        yield self._completion_json(body, "".join(collected), "length", lease.kind)
                    return

                # Phase 1 failure — hop
                await self.store.refund(lease.id)
                await self.store.record_fail(lease.id)
                self._note_outcome(False)

                if status == 429:
                    reset = getattr(lease, "_rate_reset", None)
                    if reset is None or reset <= time.time():
                        reset = next_reset_utc()
                    await self.store.set_budget_zero(lease.id, reset)
                    rate_hops += 1
                    # keep walking identities past max_tries on pure rate limits
                    if rate_hops < hard_cap:
                        attempts -= 1
                    continue
                elif status == 403:
                    if "TOS" in body_text or "Programmatic" in body_text:
                        strikes = await self.store.add_strike(lease.id, time.time() + self.config.quarantine_s)
                        if strikes >= self.config.max_strikes:
                            await self.store.set_quarantine(lease.id, next_reset_utc())
                    # else hop, no strike
                elif status == 400:
                    raise UpstreamBadRequest(body_text)
                # 5xx, connect, TLS, etc. → hop
                continue

        raise AllLanesDry()

    def _note_outcome(self, success: bool) -> None:
        self._recent_failures.append(not success)
        if len(self._recent_failures) > 20:
            self._recent_failures = self._recent_failures[-20:]

    def _chunk_json(self, delta: str, kind: str) -> bytes:
        obj = {
            "choices": [{"index": 0, "delta": {"role": "assistant", "content": delta}}],
            "object": "chat.completion.chunk",
            "venice_lane": kind,
        }
        return f"data: {json.dumps(obj)}\n\n".encode()

    def _completion_json(self, body: dict, text: str, finish: str, kind: str) -> bytes:
        obj = {
            "id": f"chatcmpl-vl-{int(time.time())}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": body.get("model", self.config.model),
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": finish,
            }],
            "venice_lane": kind,
        }
        return json.dumps(obj).encode()

    async def _real_transport(self, lease: Lease, body: dict):
        """Production transport. Dispatches by lease kind. Never used by offline tests."""
        from .identity import AttestationPool
        from .lanes import dispatch

        if self._pool is None:
            self._pool = AttestationPool()
            self._pool.start_refresh()
        token = await self._pool.get()
        async for delta in dispatch.chat(lease, body, token, self.config):
            yield delta
