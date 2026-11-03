"""Venice transport: mint, chat, SSE parse, rate read.

curl_cffi with impersonate='chrome' is mandatory on every Venice-bound request.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator

from .identity import AttestationPool, BASE_HEADERS, react_state_hash
from .leases import Lease

log = logging.getLogger(__name__)

# Fail loudly at import if curl_cffi is missing
try:
    from curl_cffi.requests import AsyncSession
except ImportError as exc:
    raise SystemExit(
        "curl_cffi is required for Venice transport (TLS fingerprint). "
        "Install it: pip install curl_cffi"
    ) from exc


MINT_URL = "https://outerface.venice.ai/api/app/user/client_attestation/mint"
CHAT_URL = "https://outerface.venice.ai/api/inference/chat/agents/venice"
RATE_URL = "https://outerface.venice.ai/api/inference/rate-limits"

# Reused impersonated sessions. A fresh session per call pays a full TLS
# handshake; the pool keeps chrome fingerprints warm.
_POOL_SIZE = 4
_sessions: asyncio.Queue | None = None
_pool_lock = asyncio.Lock()


async def _pool() -> asyncio.Queue:
    global _sessions
    if _sessions is None:
        async with _pool_lock:
            if _sessions is None:
                q: asyncio.Queue = asyncio.Queue()
                for _ in range(_POOL_SIZE):
                    await q.put(AsyncSession(impersonate="chrome"))
                _sessions = q
    return _sessions


class _Borrowed:
    def __init__(self, session, queue):
        self.session = session
        self.queue = queue

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *exc):
        await self.queue.put(self.session)


async def session():
    """Borrow a warm chrome-impersonating session. Always return it."""
    q = await _pool()
    return _Borrowed(await q.get(), q)


async def close_sessions() -> None:
    global _sessions
    q = _sessions
    _sessions = None
    if not q:
        return
    while not q.empty():
        try:
            s = q.get_nowait()
        except asyncio.QueueEmpty:
            break
        try:
            await s.close()
        except Exception:
            pass


def scrub_nul(s: str) -> str:
    """Scrub \\x00 → space. The endpoint hard-fails on NUL."""
    return s.replace("\x00", " ")


def build_venice_body(body: dict) -> dict:
    """Translate an OpenAI-shaped body into the Venice agents chat schema.

    The same normalization used for the cache key is applied here so identical
    prompts hash the same and travel the same.
    """
    import uuid

    from .cache import normalize

    messages = []
    for m in body.get("messages") or []:
        role = m.get("role", "user")
        if role not in ("user", "assistant"):
            role = "user"
        content = m.get("content", "")
        if isinstance(content, list):
            parts = []
            for p in content:
                if isinstance(p, dict) and p.get("text"):
                    parts.append(str(p["text"]))
                elif isinstance(p, str):
                    parts.append(p)
            content = "".join(parts)
        text = scrub_nul(normalize(str(content)))
        messages.append({
            "role": role,
            "status": "completed",
            "type": "message",
            "id": uuid.uuid4().hex[:22],
            "content": [{"annotations": [], "text": text, "type": "output_text"}],
        })
    return {"input": {"messages": messages}, "model": body.get("model") or "deepseek-v4-1-flash-free"}


async def parse_sse(stream: AsyncIterator[bytes]) -> AsyncIterator[str]:
    """Parse SSE. Yield deltas from response.output_text.delta. Stop at data: [DONE].

    Buffer, split on newline, on the delta event read forward to the next data
    line, json.loads, yield d['delta'] when present. Ignore unknown events.
    """
    buf = bytearray()
    expect_data = False
    async for chunk in stream:
        buf.extend(chunk)
        while True:
            nl = buf.find(b"\n")
            if nl < 0:
                break
            raw = bytes(buf[:nl])
            del buf[: nl + 1]
            line = raw.decode("utf-8", errors="replace").rstrip("\r")
            if expect_data:
                if line.startswith("data:"):
                    expect_data = False
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        return
                    try:
                        d = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    delta = d.get("delta")
                    if isinstance(delta, str):
                        yield scrub_nul(delta)
                elif line == "":
                    continue
                else:
                    expect_data = False
                continue
            if line.startswith("event: response.output_text.delta"):
                expect_data = True
            elif line.startswith("data:"):
                payload = line[5:].strip()
                if payload == "[DONE]":
                    return


async def chat(lease: Lease, body: dict, token: str = "") -> AsyncIterator[str]:
    """Yield deltas from Venice chat. Records rate-limit headers on the lease object via side channel.

    This is a stub for offline tests. Real transport uses curl_cffi. The router injects a
    transport function for tests; production wires the real session here.
    """
    # Production path is wired in router via a transport callable.
    # This function signature matches the contract; the real body is in router.
    if False:  # pragma: no cover
        yield ""


async def read_rate(lease: Lease, token: str = "") -> int:
    """GET RATE → remaining. Offline tests inject a fake. Returns 0 on failure."""
    return 0


# Real transport helpers (used when not in test mode)
async def real_mint() -> str:
    """Mint an attestation token. Returns "" on failure. Reuses a warm session."""
    try:
        async with await session() as s:
            body = {
                "count": 1,
                "env": {
                    "nativeIntegrityOk": True,
                    "reactStateHash": react_state_hash(),
                    "sentryVersion": "10.50.0",
                    "unexpectedGlobalsCount": 0,
                    "webdriver": False,
                },
            }
            resp = await s.post(MINT_URL, json=body, headers=dict(BASE_HEADERS), timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return str(data.get("token", ""))
    except Exception as exc:
        log.debug("mint failed: %s", type(exc).__name__)
    return ""


async def real_chat(lease: Lease, body: dict, token: str, proxies: str | None = None) -> AsyncIterator[str]:
    """Real chat via curl_cffi. Yields deltas. Sets rate-limit fields on the lease."""
    from .identity import AttestationPool

    headers = AttestationPool.forge(token)
    headers["Accept"] = "text/event-stream"
    proxy_map = {"http": proxies, "https": proxies} if proxies else None

    async with await session() as s:
        resp = await s.post(
            CHAT_URL,
            json=build_venice_body(body),
            headers=headers,
            timeout=30,
            stream=True,
            proxies=proxy_map,
        )
        remaining = resp.headers.get("x-ratelimit-remaining")
        reset = resp.headers.get("x-ratelimit-reset")
        if remaining is not None:
            try:
                lease._rate_remaining = int(remaining)  # type: ignore
            except ValueError:
                pass
        if reset is not None:
            try:
                ms = float(reset)
                lease._rate_reset = ms / 1000.0 if ms > 1e12 else ms  # type: ignore
            except ValueError:
                pass

        ct = resp.headers.get("content-type", "")
        if "application/json" in ct or resp.status_code >= 400:
            text = await resp.atext()
            raise UpstreamError(resp.status_code, text)

        async def byte_iter():
            async for chunk in resp.aiter_content():
                yield chunk

        async for delta in parse_sse(byte_iter()):
            yield delta


async def real_read_rate(lease: Lease, token: str = "", proxies: str | None = None) -> int:
    """GET RATE → remaining. Returns -1 on failure so callers can distinguish from a real 0."""
    from .identity import AttestationPool

    headers = AttestationPool.forge(token)
    proxy_map = {"http": proxies, "https": proxies} if proxies else None
    try:
        async with await session() as s:
            resp = await s.get(RATE_URL, headers=headers, timeout=10, proxies=proxy_map)
            if resp.status_code != 200:
                return -1
            data = resp.json()
            if isinstance(data, dict):
                for key in ("remaining", "budget", "limit"):
                    if isinstance(data.get(key), int):
                        return int(data[key])
                for v in data.values():
                    if isinstance(v, int):
                        return v
                    if isinstance(v, dict):
                        for key in ("remaining", "budget"):
                            if isinstance(v.get(key), int):
                                return int(v[key])
            return 0
    except Exception as exc:
        log.debug("rate read failed: %s", type(exc).__name__)
        return -1


class UpstreamError(Exception):
    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body
        super().__init__(f"upstream {status}: {body[:200]}")
