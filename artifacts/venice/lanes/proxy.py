"""HTTP/SOCKS5 proxy lane.

Per-proxy concurrency cap of 1. Sticky per lease (same proxy string is the same
lease forever). Health-probe with read_rate at warm time only; a proxy that
failed its probe this cycle is not retried.
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

from ..leases import Lease

LANE_KIND = "proxy"

_proxy_locks: dict[str, asyncio.Lock] = {}
_probe_failed: set[str] = set()


def lock_for(proxy: str) -> asyncio.Lock:
    lock = _proxy_locks.get(proxy)
    if lock is None:
        lock = asyncio.Lock()
        _proxy_locks[proxy] = lock
    return lock


def mark_probe_failed(proxy: str) -> None:
    _probe_failed.add(proxy)


def clear_probe_failures() -> None:
    _probe_failed.clear()


def failed_this_cycle(proxy: str) -> bool:
    return proxy in _probe_failed


async def chat(lease: Lease, body: dict, token: str) -> AsyncIterator[str]:
    from ..venice import real_chat

    proxy = lease.egress
    if failed_this_cycle(proxy):
        raise RuntimeError(f"proxy failed probe this cycle: {proxy}")
    try:
        async with lock_for(proxy):
            async for delta in real_chat(lease, body, token, proxies=proxy):
                yield delta
    except Exception:
        mark_probe_failed(proxy)
        raise
