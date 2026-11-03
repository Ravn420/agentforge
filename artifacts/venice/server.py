"""aiohttp OpenAI-compatible surface. Bind 127.0.0.1 only. Bearer required on /v1/*."""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from aiohttp import web

from .config import Config
from .leases import LeaseStore
from .router import Router, AllLanesDry, UpstreamBadRequest
from .cache import Cache
from .identity import AttestationPool

log = logging.getLogger(__name__)


def make_app(config: Config, store: LeaseStore, router: Router, cache: Cache) -> web.Application:
    app = web.Application()
    app["config"] = config
    app["store"] = store
    app["router"] = router
    app["cache"] = cache

    async def auth_middleware(request: web.Request, handler):
        if request.path.startswith("/v1/"):
            auth = request.headers.get("Authorization", "")
            token = auth.removeprefix("Bearer ").strip()
            if token != config.bearer:
                return web.json_response({"error": {"message": "unauthorized", "code": "invalid_bearer"}}, status=401)
        return await handler(request)

    app.middlewares.append(auth_middleware)

    app.router.add_get("/v1/models", handle_models)
    app.router.add_post("/v1/chat/completions", handle_chat)
    app.router.add_get("/health", handle_health)
    return app


async def handle_models(request: web.Request) -> web.Response:
    from .models_free import free_models
    return web.json_response({
        "object": "list",
        "data": [{"id": m, "object": "model", "owned_by": "venice"} for m in free_models()],
    })


async def handle_chat(request: web.Request) -> web.Response:
    cfg: Config = request.app["config"]
    router: Router = request.app["router"]
    cache: Cache = request.app["cache"]

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": {"message": "invalid json"}}, status=400)

    model = body.get("model") or cfg.model
    body["model"] = model
    # Free models only. A paid model is rejected; the model itself is never swapped.
    if body.get("usesCredits") is True:
        return web.json_response(
            {"error": {"message": "model uses credits", "code": "model_not_allowlisted"}},
            status=400,
        )
    from .models_free import is_free
    if not is_free(model):
        return web.json_response(
            {"error": {"message": "model not on the free lane", "code": "model_not_allowlisted"}},
            status=400,
        )

    messages = body.get("messages", [])
    stream = bool(body.get("stream", False))
    key = None
    try:
        from .cache import exact_key
        key = exact_key(model, messages)
    except Exception:
        key = None

    async def _serve():
        hit = await cache.get(model, messages)
        if hit:
            payload, kind = hit
            obj = json.loads(payload) if payload.startswith("{") else {"choices": [{"message": {"role": "assistant", "content": payload}, "finish_reason": "stop"}]}
            if isinstance(obj, dict):
                obj.pop("_venice_src", None)
                obj["venice_cached"] = True
                obj["venice_lane"] = kind
            if stream:
                text = ""
                if isinstance(obj, dict):
                    try:
                        text = obj["choices"][0]["message"]["content"]
                    except Exception:
                        text = payload
                else:
                    text = payload
                chunk = {
                    "choices": [{"index": 0, "delta": {"role": "assistant", "content": text}}],
                    "object": "chat.completion.chunk",
                    "venice_cached": True,
                    "venice_lane": kind,
                }
                async def cached_stream():
                    yield f"data: {json.dumps(chunk)}\n\n".encode()
                    yield b"data: [DONE]\n\n"
                resp = web.StreamResponse(status=200, headers={
                    "Content-Type": "text/event-stream",
                    "Connection": "close",
                })
                await resp.prepare(request)
                async for chunk in cached_stream():
                    await resp.write(chunk)
                await resp.write_eof()
                return resp
            return web.json_response(obj)

        if stream:
            resp = web.StreamResponse(status=200, headers={
                "Content-Type": "text/event-stream",
                "Connection": "close",
            })
            await resp.prepare(request)
            collected: list[str] = []
            truncated = False
            lane = ""
            async for chunk in router.complete(body, stream=True):
                await resp.write(chunk)
                text = chunk.decode("utf-8", errors="replace")
                if "truncated upstream" in text:
                    truncated = True
                if text.startswith("data:") and "[DONE]" not in text:
                    try:
                        obj = json.loads(text[5:].strip())
                        lane = obj.get("venice_lane") or lane
                        delta = ((obj.get("choices") or [{}])[0].get("delta") or {}).get("content")
                        if isinstance(delta, str):
                            collected.append(delta)
                    except Exception:
                        pass
            await resp.write_eof()
            # cache only complete, non-foreign, non-empty stop streams
            full = "".join(collected)
            if full.strip() and not truncated and lane != "foreign":
                completion = {
                    "object": "chat.completion",
                    "model": model,
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": full}, "finish_reason": "stop"}],
                    "venice_lane": lane,
                }
                await cache.put(model, messages, json.dumps(completion))
            return resp

        buf = b""
        async for chunk in router.complete(body, stream=False):
            buf += chunk
        obj = json.loads(buf)
        lane = obj.get("venice_lane", "")
        if lane != "foreign" and obj.get("choices") and obj["choices"][0].get("finish_reason") == "stop":
            text = obj["choices"][0]["message"]["content"]
            if text and text.strip():
                await cache.put(model, messages, buf.decode())
        return web.Response(body=buf, content_type="application/json")

    try:
        if key:
            async with cache.single_flight(key):
                return await _serve()
        return await _serve()
    except AllLanesDry:
        # nearest reset_at
        leases = await request.app["store"].all_leases()
        resets = [l.reset_at for l in leases if l.reset_at > time.time()]
        retry_after = int(min(resets) - time.time()) if resets else 60
        return web.json_response(
            {"error": {"message": "all lanes dry", "code": "all_lanes_dry"}},
            status=429,
            headers={"Retry-After": str(max(1, retry_after))},
        )
    except UpstreamBadRequest as exc:
        return web.json_response({"error": {"message": str(exc)}}, status=400)
    except Exception as exc:
        log.exception("upstream error")
        return web.json_response({"error": {"message": "upstream error"}}, status=502)


async def handle_health(request: web.Request) -> web.Response:
    store: LeaseStore = request.app["store"]
    leases = await store.all_leases()
    by_kind: dict[str, list] = {}
    for l in leases:
        by_kind.setdefault(l.kind, []).append({
            "alive": l.quarantined_until <= time.time() and (l.budget > 0 or l.kind == "foreign"),
            "budget": l.budget,
            "quarantined": l.quarantined_until > time.time(),
            "reset_at": l.reset_at,
            "total_ok": l.total_ok,
            "total_fail": l.total_fail,
        })
    return web.json_response({"lanes": by_kind})
