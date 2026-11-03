"""Warmer: at 12:00:55 UTC reset all leases, mint 8 attestations, probe each lane once.

Used both as `python -m venice.cli warm` and as the background task inside `serve`,
so a single process recovers the fleet at the daily reset with no operator.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone, timedelta

from .config import Config, load
from .leases import LeaseStore
from .identity import AttestationPool
from .lanes import browser, proxy


def next_warm_time(now: float | None = None) -> float:
    """Next 12:00:55 UTC. Never returns a past timestamp."""
    dt = datetime.fromtimestamp(now if now is not None else time.time(), tz=timezone.utc)
    candidate = dt.replace(hour=12, minute=0, second=55, microsecond=0)
    if candidate.timestamp() <= (now if now is not None else time.time()):
        candidate += timedelta(days=1)
    return candidate.timestamp()


async def warm_once(store: LeaseStore | None = None, cfg: Config | None = None, pool: AttestationPool | None = None) -> None:
    """Reset budgets, refill attestations, probe every lane. Reuses an open store when given."""
    own_store = store is None
    cfg = cfg or load()
    if store is None:
        store = LeaseStore(cfg.db_path)
        await store.open()
    await store.seed(cfg)
    await store.reset_all_non_foreign()
    proxy.clear_probe_failures()
    browser.reset_cycle()

    pool = pool or AttestationPool(size=8)
    minted = 0
    for _ in range(8):
        token = await pool.mint()
        if token:
            minted += 1
            pool._tokens.append((token, asyncio.get_event_loop().time()))
    print(f"warm: minted {minted}/8, budgets reset")

    from .cli import _probe
    for lease in await store.all_leases():
        status, reason = await _probe(lease, cfg)
        print(f"warm: {status}\t{lease.kind}\t{reason}")
    if own_store:
        await browser.close()
        await store.close()


async def run_forever(store: LeaseStore, cfg: Config, pool: AttestationPool, stop: asyncio.Event) -> None:
    """Sleep until 12:00:55 UTC, warm, repeat. Exits when stop is set."""
    while not stop.is_set():
        target = next_warm_time()
        try:
            await asyncio.wait_for(stop.wait(), timeout=max(0.0, target - time.time()))
            return
        except asyncio.TimeoutError:
            pass
        try:
            await warm_once(store, cfg, pool)
        except Exception as exc:
            print(f"warm failed: {type(exc).__name__}")


async def main():
    stop = asyncio.Event()
    cfg = load()
    store = LeaseStore(cfg.db_path)
    await store.open()
    try:
        await run_forever(store, cfg, AttestationPool(), stop)
    finally:
        await store.close()


if __name__ == "__main__":
    asyncio.run(main())
