"""OpenRouter/Groq/Cerebras passthrough.

Skip Venice headers and attestation entirely. Translate messages to the
provider schema, pass its status through, tag venice_lane: "foreign", never cache.
"""
from __future__ import annotations

import json
from typing import AsyncIterator

from ..config import Config
from ..leases import Lease
from ..venice import UpstreamError, scrub_nul

LANE_KIND = "foreign"


def _messages(body: dict) -> list[dict]:
    out = []
    for m in body.get("messages") or []:
        content = m.get("content", "")
        if isinstance(content, list):
            parts = []
            for p in content:
                if isinstance(p, dict) and p.get("text"):
                    parts.append(scrub_nul(str(p["text"])))
                elif isinstance(p, str):
                    parts.append(scrub_nul(p))
            content = "".join(parts)
        else:
            content = scrub_nul(str(content))
        out.append({"role": m.get("role", "user"), "content": content})
    return out


async def chat(lease: Lease, body: dict, config: Config) -> AsyncIterator[str]:
    from curl_cffi.requests import AsyncSession

    if not config.foreign_base_url:
        raise RuntimeError("foreign lane has no base url")
    url = config.foreign_base_url.rstrip("/") + "/chat/completions"
    model = config.foreign_model or body.get("model") or config.model
    payload = {
        "model": model,
        "messages": _messages(body),
        "stream": True,
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    if config.foreign_api_key:
        headers["Authorization"] = f"Bearer {config.foreign_api_key}"

    async with AsyncSession(impersonate="chrome") as session:
        resp = await session.post(url, json=payload, headers=headers, timeout=60, stream=True)
        if resp.status_code >= 400:
            text = ""
            try:
                text = await resp.atext()
            except Exception:
                pass
            raise UpstreamError(resp.status_code, text)
        buf = ""
        async for chunk in resp.aiter_content():
            buf += chunk.decode("utf-8", errors="replace")
            while "\n" in buf:
                line, buf = buf.split("\n", 1)
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                payload_s = line[5:].strip()
                if payload_s == "[DONE]":
                    return
                try:
                    obj = json.loads(payload_s)
                except json.JSONDecodeError:
                    continue
                choices = obj.get("choices") or []
                if not choices:
                    continue
                delta = (choices[0].get("delta") or {}).get("content")
                if delta is None:
                    delta = ((choices[0].get("message") or {}).get("content"))
                if isinstance(delta, str) and delta:
                    yield scrub_nul(delta)
