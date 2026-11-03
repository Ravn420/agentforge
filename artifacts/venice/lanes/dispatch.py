"""Lane dispatch. Routes a reserved lease to the correct transport."""
from __future__ import annotations

from typing import AsyncIterator

from ..config import Config
from ..leases import Lease
from . import browser, cf, foreign, proxy


async def chat(lease: Lease, body: dict, token: str, config: Config) -> AsyncIterator[str]:
    kind = lease.kind
    if kind == "cf":
        async for d in cf.chat(lease, body, config):
            yield d
        return
    if kind == "proxy":
        async for d in proxy.chat(lease, body, token):
            yield d
        return
    if kind == "browser":
        async for d in browser.chat(lease, body, token, config):
            yield d
        return
    if kind == "foreign":
        async for d in foreign.chat(lease, body, config):
            yield d
        return
    # account (local egress) and anything else: direct Venice
    from ..venice import real_chat
    async for d in real_chat(lease, body, token):
        yield d
