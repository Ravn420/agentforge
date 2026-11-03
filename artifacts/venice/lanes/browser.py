"""CDP Chrome lane.

Hard concurrency cap 1 under an asyncio.Lock. Navigation is single-flight.
Watchdog kills and respawns Chrome after browser_idle_timeout_s with no frame.
Persistent profile at ~/.config/venice-lane/chrome.
Disconnect backoff 2s, 10s, 60s; three consecutive disconnects disables the lane
for the cycle.
"""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
import time
from pathlib import Path
from typing import AsyncIterator

from ..config import Config
from ..leases import Lease

log = logging.getLogger(__name__)

LANE_KIND = "browser"
PROFILE_DIR = Path.home() / ".config" / "venice-lane" / "chrome"
DEBUG_PORT = 9222
_BACKOFF = (2.0, 10.0, 60.0)

_lock = asyncio.Lock()
_proc: asyncio.subprocess.Process | None = None
_last_frame = 0.0
_disconnects = 0
_disabled = False
_watchdog: asyncio.Task | None = None


def disabled() -> bool:
    return _disabled


def reset_cycle() -> None:
    global _disabled, _disconnects
    _disabled = False
    _disconnects = 0


async def _chrome_bin() -> str | None:
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"):
        path = shutil.which(name)
        if path:
            return path
    return None


async def _port_open() -> bool:
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection("127.0.0.1", DEBUG_PORT), timeout=0.4
        )
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return True
    except Exception:
        return False


async def ensure_chrome(idle_timeout_s: int) -> None:
    global _proc, _watchdog
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    if await _port_open():
        _arm_watchdog(idle_timeout_s)
        return
    binary = await _chrome_bin()
    if not binary:
        raise RuntimeError("chrome/chromium not installed")
    if _proc and _proc.returncode is None:
        _proc.kill()
        await _proc.wait()
    _proc = await asyncio.create_subprocess_exec(
        binary,
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={PROFILE_DIR}",
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    # wait for the port
    for _ in range(20):
        if await _port_open():
            _arm_watchdog(idle_timeout_s)
            return
        await asyncio.sleep(0.25)
    raise RuntimeError("chrome debug port did not come up")


def _arm_watchdog(idle_timeout_s: int) -> None:
    global _watchdog
    if _watchdog and not _watchdog.done():
        return

    async def _run():
        global _proc
        while True:
            await asyncio.sleep(5)
            if _last_frame and time.time() - _last_frame > idle_timeout_s:
                log.info("browser idle timeout; respawning chrome")
                if _proc and _proc.returncode is None:
                    _proc.kill()
                    await _proc.wait()
                _proc = None
                return

    _watchdog = asyncio.create_task(_run())


async def _note_disconnect() -> None:
    global _disconnects, _disabled
    _disconnects += 1
    if _disconnects >= 3:
        _disabled = True
        log.warning("browser lane disabled for this cycle after 3 disconnects")
        return
    await asyncio.sleep(_BACKOFF[min(_disconnects - 1, len(_BACKOFF) - 1)])


async def chat(lease: Lease, body: dict, token: str, config: Config) -> AsyncIterator[str]:
    """Fetch the Venice chat endpoint from page context via CDP Runtime.evaluate."""
    global _last_frame
    if _disabled:
        raise RuntimeError("browser lane disabled this cycle")
    async with _lock:
        await ensure_chrome(config.browser_idle_timeout_s)
        try:
            text = await _evaluate_fetch(body, token)
        except Exception:
            await _note_disconnect()
            raise
        _last_frame = time.time()
        _disconnects_reset()
        if text:
            yield text


def _disconnects_reset() -> None:
    global _disconnects
    _disconnects = 0


async def _evaluate_fetch(body: dict, token: str) -> str:
    """One-shot CDP evaluate of a fetch() against the Venice chat endpoint."""
    import aiohttp

    from ..venice import build_venice_body
    from ..identity import BASE_HEADERS

    async with aiohttp.ClientSession() as http:
        async with http.get(f"http://127.0.0.1:{DEBUG_PORT}/json/version") as resp:
            info = await resp.json()
        ws_url = info.get("webSocketDebuggerUrl")
        if not ws_url:
            raise RuntimeError("no CDP websocket")
        async with http.ws_connect(ws_url) as ws:
            await ws.send_json({"id": 1, "method": "Runtime.enable"})
            headers = dict(BASE_HEADERS)
            headers["Accept"] = "text/event-stream"
            if token:
                headers["x-venice-client-attestation"] = token
            payload = build_venice_body(body)
            js = (
                "fetch('https://outerface.venice.ai/api/inference/chat/agents/venice',{"
                "method:'POST',headers:" + json.dumps(headers) + ",body:" + json.dumps(json.dumps(payload)) +
                "}).then(r=>r.text())"
            )
            await ws.send_json({
                "id": 2,
                "method": "Runtime.evaluate",
                "params": {"expression": js, "awaitPromise": True, "returnByValue": True},
            })
            while True:
                msg = await ws.receive(timeout=30)
                if msg.type != aiohttp.WSMsgType.TEXT:
                    continue
                data = json.loads(msg.data)
                if data.get("id") != 2:
                    continue
                result = (data.get("result") or {}).get("result") or {}
                if result.get("subtype") == "error" or "exceptionDetails" in (data.get("result") or {}):
                    raise RuntimeError("cdp evaluate failed")
                return str(result.get("value") or "")


async def close() -> None:
    global _proc, _watchdog
    if _watchdog and not _watchdog.done():
        _watchdog.cancel()
    if _proc and _proc.returncode is None:
        _proc.kill()
        await _proc.wait()
    _proc = None
