"""CLI: serve, warm, doctor, leases, quarantine."""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys
import time

from .config import load
from .leases import LeaseStore
from .router import Router
from .cache import Cache
from .identity import AttestationPool
from .server import make_app
from .lanes import browser, proxy

log = logging.getLogger("venice")


async def _probe(lease, cfg) -> tuple[str, str]:
    """Return (PASS|FAIL, reason). Never raises. No credentials in the reason."""
    now = time.time()
    if lease.quarantined_until > now:
        return "FAIL", "quarantined"
    if lease.kind == "foreign":
        if not cfg.foreign_base_url:
            return "FAIL", "no base url"
        try:
            from curl_cffi.requests import AsyncSession
            async with AsyncSession(impersonate="chrome") as session:
                resp = await session.get(cfg.foreign_base_url.rstrip("/") + "/models", timeout=8)
            return ("PASS", f"http {resp.status_code}") if resp.status_code < 500 else ("FAIL", f"http {resp.status_code}")
        except Exception as exc:
            return "FAIL", type(exc).__name__
    if lease.kind == "cf":
        try:
            from .lanes.cf import worker_url
            from curl_cffi.requests import AsyncSession
            url = worker_url(lease, cfg)
            async with AsyncSession(impersonate="chrome") as session:
                resp = await session.get(url, timeout=8)
            return ("PASS", f"reachable {resp.status_code}") if resp.status_code < 500 else ("FAIL", f"http {resp.status_code}")
        except Exception as exc:
            return "FAIL", type(exc).__name__
    if lease.kind == "browser":
        if browser.disabled():
            return "FAIL", "disabled this cycle"
        try:
            await browser.ensure_chrome(cfg.browser_idle_timeout_s)
            return "PASS", "debug port up"
        except Exception as exc:
            return "FAIL", str(exc)[:80]
    # account and proxy: rate probe
    try:
        from .venice import real_read_rate
        proxies = lease.egress if lease.kind == "proxy" else None
        remaining = await real_read_rate(lease, proxies=proxies)
        if remaining < 0:
            if lease.kind == "proxy":
                proxy.mark_probe_failed(lease.egress)
            return "FAIL", "rate probe failed"
        return "PASS", f"remaining={remaining}"
    except Exception as exc:
        return "FAIL", type(exc).__name__


async def cmd_serve(args):
    """One process: proxy, attestation pool, daily warmer, and lease keeper.

    Point any OpenAI client at http://127.0.0.1:<port>/v1. The process hops
    egress on 429, adopts x-ratelimit-remaining, and resets itself at 12:00:55 UTC.
    """
    cfg = load()
    store = LeaseStore(cfg.db_path)
    await store.open()
    await store.seed(cfg)
    cache = Cache(store, ttl_s=cfg.cache_ttl_s, semantic_threshold=cfg.semantic_threshold, semantic_min_chars=cfg.semantic_min_chars)
    router = Router(store, cfg)
    pool = AttestationPool()
    pool.start_refresh()

    app = make_app(cfg, store, router, cache)
    from aiohttp import web
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", cfg.port)
    await site.start()

    leases = await store.all_leases()
    by_kind: dict[str, int] = {}
    for l in leases:
        by_kind[l.kind] = by_kind.get(l.kind, 0) + 1
    egresses = sum(by_kind.values())
    print(f"venice-lane ready on 127.0.0.1:{cfg.port}")
    print(f"  base url:  http://127.0.0.1:{cfg.port}/v1")
    print(f"  api key:   {cfg.bearer}")
    print(f"  model:     {cfg.model}")
    print(f"  egresses:  {egresses} ({', '.join(f'{n} {k}' for k, n in sorted(by_kind.items()))})")
    if egresses <= 1 and "foreign" not in by_kind:
        print("  using this machine's IP. fine for light use; it resets itself at 12:01 UTC.")

    stop = asyncio.Event()

    def _stop(*_):
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _stop)
        except NotImplementedError:
            pass

    from .warmer import run_forever

    async def keeper():
        """Reactivate expired leases and pick up newly configured workers."""
        while not stop.is_set():
            try:
                await store.reactivate()
                await store.seed(cfg)
            except Exception as exc:
                log.debug("keeper: %s", type(exc).__name__)
            try:
                await asyncio.wait_for(stop.wait(), timeout=30)
                return
            except asyncio.TimeoutError:
                pass

    warmer_task = asyncio.create_task(run_forever(store, cfg, pool, stop))
    keeper_task = asyncio.create_task(keeper())
    try:
        await stop.wait()
    finally:
        print("shutting down")
        warmer_task.cancel()
        keeper_task.cancel()
        from .venice import close_sessions
        await runner.cleanup()
        await browser.close()
        await close_sessions()
        await store.close()


async def cmd_leases(args):
    cfg = load()
    store = LeaseStore(cfg.db_path)
    await store.open()
    print(f"{'id':>4}  {'kind':<8}  {'budget':>8}  {'strikes':>7}  {'ok':>6}  {'fail':>6}  status")
    now = time.time()
    for l in await store.all_leases():
        status = "quarantine" if l.quarantined_until > now else "live"
        print(f"{l.id:>4}  {l.kind:<8}  {l.budget:>8}  {l.strikes:>7}  {l.total_ok:>6}  {l.total_fail:>6}  {status}")
    await store.close()


async def cmd_quarantine(args):
    cfg = load()
    store = LeaseStore(cfg.db_path)
    await store.open()
    until = time.time() + int(args.seconds)
    await store.set_quarantine(int(args.id), until)
    print(f"lease {args.id} quarantined for {args.seconds}s")
    await store.close()


async def cmd_doctor(args):
    cfg = load()
    store = LeaseStore(cfg.db_path)
    await store.open()
    await store.seed(cfg)
    proxy.clear_probe_failures()
    browser.reset_cycle()
    for l in await store.all_leases():
        status, reason = await _probe(l, cfg)
        print(f"{status}\t{l.kind}\t{reason}")
    await browser.close()
    await store.close()


async def cmd_warm(args):
    from .warmer import warm_once
    await warm_once()


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="venice")
    sub = parser.add_subparsers(dest="cmd")

    p_serve = sub.add_parser("serve")
    p_serve.set_defaults(func=cmd_serve)

    p_leases = sub.add_parser("leases")
    p_leases.set_defaults(func=cmd_leases)

    p_q = sub.add_parser("quarantine")
    p_q.add_argument("id")
    p_q.add_argument("seconds")
    p_q.set_defaults(func=cmd_quarantine)

    p_doc = sub.add_parser("doctor")
    p_doc.set_defaults(func=cmd_doctor)

    p_warm = sub.add_parser("warm")
    p_warm.set_defaults(func=cmd_warm)

    p_wiz = sub.add_parser("wizard", help="guided setup in the terminal")
    p_wiz.set_defaults(func=None, wizard=True)

    p_gui = sub.add_parser("gui", help="guided setup in the browser")
    p_gui.set_defaults(func=None, gui=True)

    args = parser.parse_args()
    if getattr(args, "gui", False):
        from .gui import run as gui_run
        gui_run()
        return
    if getattr(args, "wizard", False) or not getattr(args, "func", None):
        from .config import DEFAULT_CONFIG_PATH
        first = not DEFAULT_CONFIG_PATH.exists()
        if getattr(args, "wizard", False) or first:
            from .wizard import run as wizard_run
            wizard_run()
            return
        args.func = cmd_serve
    asyncio.run(args.func(args))


if __name__ == "__main__":
    main()
