"""Cloudflare Worker fleet lane.

Local side treats each configured worker URL as a sticky lease. The worker
itself hops by retrying (each retry is a fresh CF egress IP).
"""
from __future__ import annotations

import json
from typing import AsyncIterator

from ..config import Config
from ..leases import Lease

LANE_KIND = "cf"


def worker_url(lease: Lease, config: Config) -> str:
    egress = lease.egress
    if egress.startswith("cf:") and egress[3:].startswith("http"):
        return egress[3:]
    # legacy cf:w-N
    if egress.startswith("cf:w-"):
        try:
            idx = int(egress.split("-", 1)[1])
            return config.cf_workers[idx]
        except (ValueError, IndexError):
            pass
    if config.cf_workers:
        return config.cf_workers[0]
    raise RuntimeError(f"no worker URL for {egress}")


async def chat(lease: Lease, body: dict, config: Config) -> AsyncIterator[str]:
    """POST the OpenAI-shaped body to the worker and yield content deltas."""
    from curl_cffi.requests import AsyncSession

    url = worker_url(lease, config)
    headers = {
        "Authorization": f"Bearer {config.bearer}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    async with AsyncSession(impersonate="chrome") as session:
        resp = await session.post(url, json=body, headers=headers, timeout=60, stream=True)
        if resp.status_code >= 400:
            text = ""
            try:
                text = await resp.atext()
            except Exception:
                pass
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
            from ..venice import UpstreamError
            raise UpstreamError(resp.status_code, text)
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
        buf = ""
        async for chunk in resp.aiter_content():
            buf += chunk.decode("utf-8", errors="replace")
            while "\n" in buf:
                line, buf = buf.split("\n", 1)
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    return
                try:
                    obj = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                choices = obj.get("choices") or []
                if not choices:
                    continue
                delta = (choices[0].get("delta") or {}).get("content")
                if isinstance(delta, str) and delta:
                    yield delta
