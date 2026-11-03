"""Attestation pool and header forge for Venice requests."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid

log = logging.getLogger(__name__)

# Fixed headers per spec §1
BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    "Accept-Encoding": "identity",
    "Origin": "https://venice.ai",
    "Referer": "https://venice.ai/",
    "x-venice-locale": "en",
    "x-venice-version": "interface@20261023.172051+9e9fe40",
    "x-venice-middleface-version": "0.1.1161",
    "sec-ch-ua": '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Content-Type": "application/json",
}


class AttestationPool:
    """Size-8 pool, ttl 240s. Exactly one mint in flight. Never raises, never blocks a request."""

    def __init__(self, size: int = 8, ttl: float = 240.0):
        self.size = size
        self.ttl = ttl
        self._lock = asyncio.Lock()
        self._tokens: list[tuple[str, float]] = []  # (token, minted_at)
        self._refresh_task: asyncio.Task | None = None
        self._fill_task: asyncio.Task | None = None
        self._logged_empty = False
        self._rr = 0

    async def get(self) -> str:
        """Return a live token or empty string. Never raises, never blocks a request."""
        now = asyncio.get_event_loop().time()
        self._tokens = [(t, ts) for t, ts in self._tokens if now - ts < self.ttl]
        if self._tokens:
            self._logged_empty = False
            self._rr = (self._rr + 1) % len(self._tokens)
            return self._tokens[self._rr][0]
        # Kick a background fill. Do not await it — a request must not wait on mint.
        self._kick_fill()
        if not self._logged_empty:
            log.info("attestation pool empty; proceeding without header this cycle")
            self._logged_empty = True
        return ""

    def _kick_fill(self) -> None:
        if self._fill_task is None or self._fill_task.done():
            self._fill_task = asyncio.create_task(self._fill())

    async def _fill(self) -> None:
        """Mint under the lock until the pool is full or a mint fails."""
        backoff = (5.0, 15.0, 60.0)
        bi = 0
        while len(self._tokens) < self.size:
            async with self._lock:
                if len(self._tokens) >= self.size:
                    return
                token = await self.mint()
                if token:
                    self._tokens.append((token, asyncio.get_event_loop().time()))
                    self._tokens = self._tokens[-self.size :]
                    bi = 0
                    continue
            await asyncio.sleep(backoff[min(bi, len(backoff) - 1)])
            bi = min(bi + 1, len(backoff) - 1)
            if bi >= len(backoff):
                return

    async def mint(self) -> str:
        """Mint a single attestation token. Returns "" on failure. Never raises."""
        try:
            from .venice import real_mint
            return await real_mint()
        except Exception as exc:
            log.debug("mint failed: %s", type(exc).__name__)
            return ""

    @staticmethod
    def forge(token: str) -> dict[str, str]:
        """Required headers. Fresh x-venice-distinct-id per request."""
        h = dict(BASE_HEADERS)
        h["x-venice-distinct-id"] = str(uuid.uuid4())
        if token:
            h["x-venice-client-attestation"] = token
        return h

    def headers(self, token: str) -> dict[str, str]:
        return self.forge(token)

    def start_refresh(self) -> None:
        """Background refresh at ttl - 30s under the same lock."""
        if self._refresh_task is None or self._refresh_task.done():
            self._refresh_task = asyncio.create_task(self._refresh_loop())
        self._kick_fill()

    async def _refresh_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(max(1.0, self.ttl - 30.0))
                await self._fill()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.debug("attestation refresh error: %s", type(exc).__name__)
                await asyncio.sleep(5.0)


def react_state_hash() -> str:
    """Deterministic sha256 for the mint body env.reactStateHash."""
    return hashlib.sha256(b"venice-lane-react-state").hexdigest()
