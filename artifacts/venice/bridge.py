"""AgentForge bridge. One JSON object on stdout. No invented completions.

    python -m venice.bridge status
    python -m venice.bridge rotate
    python -m venice.bridge complete   # JSON body on stdin
"""
from __future__ import annotations

import asyncio
import json
import sys
import time

from .config import load
from .leases import LeaseStore
from .models_free import is_free
from .proxy_rotate import add, label
from .router import AllLanesDry, Router, UpstreamBadRequest

# Dropdown ids that are not real free-lane ids. The requested family is kept;
# only the id is translated onto the anonymous free lane.
_ALIASES = {
    "deepseek-r1": "deepseek-v4-1-flash-free",
    "deepseek-v3": "deepseek-v4-1-flash-free",
    "uncensored": "venice-uncensored-1-2",
    "qwen-2.5-72b": "qwen-2.5-coder-32b",
    "mistral-small-3": "mistral-31-24b",
    "mistral-nemo": "mistral-31-24b",
    "dolphin-3.0": "venice-uncensored-1-2",
    "hermes-3-8b": "venice-uncensored-1-2",
}


def resolve_model(model: str) -> str:
    raw = (model or "").strip()
    if raw.startswith("venice-"):
        raw = raw[len("venice-"):]
    if is_free(raw):
        return raw
    mapped = _ALIASES.get(raw)
    if mapped:
        return mapped
    return raw


def _slot(lease, now: float) -> dict:
    cooling = lease.quarantined_until > now or lease.budget <= 0
    return {
        "id": lease.egress,
        "name": label(lease.egress) if lease.kind == "proxy" else lease.egress,
        "kind": lease.kind,
        "type": lease.kind,
        "status": "rate_limited" if cooling else "active",
        "budget": lease.budget,
        "ok": lease.total_ok,
        "fail": lease.total_fail,
        "latencyMs": lease.total_ok,
    }


async def _open():
    cfg = load()
    store = LeaseStore(cfg.db_path)
    await store.open()
    await store.seed(cfg)
    return cfg, store


async def status() -> dict:
    cfg, store = await _open()
    now = time.time()
    rows = await store.all_leases()
    await store.close()
    slots = [_slot(r, now) for r in rows if r.kind == "account"]
    proxies = [_slot(r, now) for r in rows if r.kind == "proxy"]
    ready = [s for s in slots if s["status"] == "active"]
    proxy_ready = [s for s in proxies if s["status"] == "active"]
    used = [r for r in rows if r.kind == "account" and r.last_used > 0 and r.quarantined_until <= now and r.budget > 0]
    active = max(used, key=lambda r: r.last_used).egress if used else (ready[0]["id"] if ready else "")
    used_proxy = [r for r in rows if r.kind == "proxy" and r.last_used > 0 and r.quarantined_until <= now and r.budget > 0]
    active_proxy = max(used_proxy, key=lambda r: r.last_used).egress if used_proxy else (proxy_ready[0]["id"] if proxy_ready else "")
    return {
        "ok": True,
        "model": cfg.model,
        "activeIdentityId": active,
        "activeProxy": active_proxy,
        "ready": len(ready),
        "cooling": len(slots) - len(ready),
        "proxyReady": len(proxy_ready),
        "slots": slots,
        "proxies": proxies,
    }


async def rotate() -> dict:
    cfg, store = await _open()
    now = time.time()
    rows = await store.all_leases()
    proxies = [r for r in rows if r.kind == "proxy"]
    pool = proxies if proxies else [r for r in rows if r.kind == "account"]
    if not pool:
        await store.close()
        return {"ok": False, "error": "nothing to rotate"}
    used = [r for r in pool if r.last_used > 0]
    current = max(used, key=lambda r: r.last_used) if used else pool[0]
    await store.set_quarantine(current.id, now + 90)
    await store.set_budget_zero(current.id, now + 90)
    eligible = [r for r in await store.list_eligible(time.time()) if r.kind == current.kind]
    nxt = eligible[0].egress if eligible else ""
    await store.close()
    return {
        "ok": True,
        "kind": current.kind,
        "from": current.egress,
        "activeIdentityId": nxt if current.kind == "account" else "",
        "activeProxy": nxt if current.kind == "proxy" else "",
        "rotationCount": 1,
    }


async def add_proxy(url: str) -> dict:
    try:
        saved = add(url)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    info = await status()
    info["saved"] = len(saved)
    return info


async def complete(payload: dict) -> dict:
    model = resolve_model(str(payload.get("model") or ""))
    if not is_free(model):
        return {"ok": False, "error": f"{model} is not on the Venice free lane", "model": model}
    messages = payload.get("messages") or [{"role": "user", "content": str(payload.get("prompt") or "")}]
    cfg, store = await _open()
    router = Router(store, cfg)
    body = {"model": model, "messages": messages, "temperature": payload.get("temperature", 0.7)}
    hops = 0
    try:
        chunks = []
        async for chunk in router.complete(body, stream=False):
            chunks.append(chunk.decode() if isinstance(chunk, (bytes, bytearray)) else chunk)
        raw = "".join(chunks)
        data = json.loads(raw)
        text = data["choices"][0]["message"]["content"]
        identity = router._current.egress if router._current else ""
        if not text:
            return {"ok": False, "error": "empty completion", "model": model, "identity": identity}
        return {"ok": True, "text": text, "model": model, "identity": identity, "hops": hops}
    except AllLanesDry:
        return {"ok": False, "error": "every Venice identity is rate-limited until the daily reset", "model": model}
    except UpstreamBadRequest as exc:
        return {"ok": False, "error": str(exc) or "Venice rejected the request", "model": model}
    finally:
        await store.close()


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        print(json.dumps(asyncio.run(status())))
    elif cmd == "rotate":
        print(json.dumps(asyncio.run(rotate())))
    elif cmd == "add-proxy":
        raw = json.loads(sys.stdin.read() or "{}")
        print(json.dumps(asyncio.run(add_proxy(str(raw.get("url") or "")))))
    elif cmd == "complete":
        raw = sys.stdin.read() or "{}"
        print(json.dumps(asyncio.run(complete(json.loads(raw)))))
    else:
        print(json.dumps({"ok": False, "error": f"unknown command {cmd}"}))


if __name__ == "__main__":
    main()
