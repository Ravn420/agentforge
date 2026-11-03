"""Local GUI wizard. Opens in the browser. No terminal prompts.

Run with `python -m venice gui`.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import webbrowser
from pathlib import Path

from aiohttp import web

from .config import DEFAULT_CONFIG_PATH, _chrome_present, ensure_config, load
from .models_free import free_models

GUI_PORT = 8765


def _deps() -> dict[str, bool]:
    out = {}
    for name in ("aiohttp", "aiosqlite", "curl_cffi"):
        try:
            __import__(name)
            out[name] = True
        except Exception:
            out[name] = False
    return out


def _port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _status() -> dict:
    deps = _deps()
    cfg = None
    if DEFAULT_CONFIG_PATH.exists():
        try:
            cfg = load()
        except SystemExit:
            cfg = None
    return {
        "python": sys.version.split()[0],
        "python_ok": sys.version_info >= (3, 11),
        "deps": deps,
        "deps_ok": all(deps.values()),
        "chrome": _chrome_present(),
        "config_exists": DEFAULT_CONFIG_PATH.exists(),
        "config_path": str(DEFAULT_CONFIG_PATH),
        "port": cfg.port if cfg else 8000,
        "bearer": cfg.bearer if cfg else "",
        "model": cfg.model if cfg else "deepseek-v4-1-flash-free",
        "models": list(free_models()),
        "proxy_up": _port_open(cfg.port if cfg else 8000),
    }


async def handle_status(_request: web.Request) -> web.Response:
    return web.json_response(_status())


async def handle_setup(_request: web.Request) -> web.Response:
    ensure_config()
    return web.json_response(_status())


async def handle_install(_request: web.Request) -> web.Response:
    req = Path(__file__).resolve().parent / "requirements.txt"
    proc = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(req)],
        capture_output=True, text=True,
    )
    body = _status()
    body["install_ok"] = proc.returncode == 0
    body["install_log"] = (proc.stdout + proc.stderr)[-2000:]
    return web.json_response(body)


_serve_proc: subprocess.Popen | None = None


async def handle_start(_request: web.Request) -> web.Response:
    global _serve_proc
    ensure_config()
    st = _status()
    if st["proxy_up"]:
        return web.json_response(st)
    if _serve_proc is None or _serve_proc.poll() is not None:
        root = str(Path(__file__).resolve().parent.parent)
        env = os.environ.copy()
        env["PYTHONPATH"] = root + os.pathsep + env.get("PYTHONPATH", "")
        _serve_proc = subprocess.Popen(
            [sys.executable, "-m", "venice", "serve"],
            cwd=root,
            env=env,
        )
    st = _status()
    st["starting"] = True
    return web.json_response(st)


PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>venice-lane</title>
<style>
  :root { --bg:#0e1116; --card:#171c24; --line:#2a3340; --text:#e7edf4; --muted:#8b98a8; --accent:#7aa2ff; --ok:#3dd68c; --warn:#f0b429; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; }
  .wrap { max-width:720px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:22px; margin:0 0 4px; letter-spacing:-.02em; }
  .sub { color:var(--muted); margin:0 0 24px; }
  .steps { display:flex; gap:8px; margin-bottom:24px; }
  .steps span { flex:1; height:4px; border-radius:2px; background:var(--line); }
  .steps span.on { background:var(--accent); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:16px; }
  h2 { font-size:16px; margin:0 0 12px; }
  .row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--line); }
  .row:last-child { border-bottom:0; }
  .k { color:var(--muted); }
  .ok { color:var(--ok); } .bad { color:var(--warn); }
  button, .btn { background:var(--accent); color:#0e1116; border:0; border-radius:8px; padding:10px 16px; font-weight:600; cursor:pointer; }
  button.ghost { background:transparent; color:var(--text); border:1px solid var(--line); }
  .actions { display:flex; gap:8px; margin-top:16px; }
  .copy { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; background:#0b0e13; border:1px solid var(--line); border-radius:8px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; margin:6px 0; }
  .copy span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .models { display:flex; flex-wrap:wrap; gap:6px; }
  .models i { font-style:normal; background:#0b0e13; border:1px solid var(--line); border-radius:999px; padding:4px 10px; font-size:13px; }
  .note { color:var(--muted); font-size:13px; margin-top:8px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>venice-lane</h1>
  <p class="sub">Local proxy for Venice free models. Rate limits hop identities; you never see them.</p>
  <div class="steps" id="steps"></div>
  <div id="view"></div>
</div>
<script>
const STEPS = ["Checks","Setup","Client","Start"];
let step = 0, state = {};

function stepsBar() {
  document.getElementById("steps").innerHTML = STEPS.map((_,i) =>
    `<span class="${i<=step?'on':''}"></span>`).join("");
}
async function api(path, method="GET") {
  const r = await fetch(path, {method});
  return r.json();
}
function copy(text, el) {
  navigator.clipboard.writeText(text);
  el.textContent = "copied";
  setTimeout(() => el.textContent = "copy", 1200);
}
function render() {
  stepsBar();
  const v = document.getElementById("view");
  if (step === 0) {
    const d = state.deps || {};
    const rows = Object.entries(d).map(([k,ok]) =>
      `<div class="row"><span class="k">${k}</span><span class="${ok?'ok':'bad'}">${ok?'ok':'missing'}</span></div>`).join("");
    v.innerHTML = `<div class="card"><h2>Checks</h2>
      <div class="row"><span class="k">python</span><span class="${state.python_ok?'ok':'bad'}">${state.python||''}</span></div>
      ${rows}
      <div class="row"><span class="k">chrome</span><span>${state.chrome?'found':'not found'}</span></div>
      <div class="actions">
        ${state.deps_ok?'':'<button onclick="install()">Install missing</button>'}
        <button onclick="next()" ${state.python_ok&&state.deps_ok?'':'disabled'}>Continue</button>
      </div></div>`;
  } else if (step === 1) {
    v.innerHTML = `<div class="card"><h2>Setup</h2>
      <p>A config is written for you. Nothing to edit.</p>
      <div class="row"><span class="k">config</span><span>${state.config_path||''}</span></div>
      <div class="row"><span class="k">identities</span><span>16 slots on this IP</span></div>
      <div class="note">One home IP has a daily free cap. Extra IPs (Cloudflare workers) are optional and not needed to start.</div>
      <div class="actions"><button class="ghost" onclick="back()">Back</button><button onclick="setup()">Create and continue</button></div></div>`;
  } else if (step === 2) {
    const base = `http://127.0.0.1:${state.port}/v1`;
    const models = (state.models||[]).map(m => `<i>${m}${m===state.model?' · default':''}</i>`).join("");
    v.innerHTML = `<div class="card"><h2>Client</h2>
      <p>Paste these into any OpenAI-compatible client.</p>
      <div class="copy"><span>${base}</span><button class="ghost" onclick="copy('${base}', this)">copy</button></div>
      <div class="copy"><span>${state.bearer}</span><button class="ghost" onclick="copy('${state.bearer}', this)">copy</button></div>
      <div class="copy"><span>${state.model}</span><button class="ghost" onclick="copy('${state.model}', this)">copy</button></div>
      <div class="models">${models}</div>
      <div class="note">The model you request is the one you get. A rate limit hops identity, not model.</div>
      <div class="actions"><button class="ghost" onclick="back()">Back</button><button onclick="next()">Continue</button></div></div>`;
  } else {
    const up = state.proxy_up;
    v.innerHTML = `<div class="card"><h2>Start</h2>
      <div class="row"><span class="k">proxy</span><span class="${up?'ok':'bad'}">${up?'running on 127.0.0.1:'+state.port:'stopped'}</span></div>
      <div class="note">Leave this page open if you start from here. The proxy keeps running after you close it.</div>
      <div class="actions">
        <button class="ghost" onclick="back()">Back</button>
        <button onclick="start()">${up?'Refresh':'Start proxy'}</button>
      </div></div>`;
  }
}
async function refresh() { state = await api("/api/status"); render(); }
async function install() { state = await api("/api/install","POST"); render(); }
async function setup() { state = await api("/api/setup","POST"); step = 2; render(); }
async function start() { state = await api("/api/start","POST"); setTimeout(refresh, 800); render(); }
function next() { step = Math.min(step+1, STEPS.length-1); render(); }
function back() { step = Math.max(step-1, 0); render(); }
refresh();
</script>
</body>
</html>"""


async def handle_index(_request: web.Request) -> web.Response:
    return web.Response(text=PAGE, content_type="text/html")


def run() -> None:
    app = web.Application()
    app.router.add_get("/", handle_index)
    app.router.add_get("/api/status", handle_status)
    app.router.add_post("/api/setup", handle_setup)
    app.router.add_post("/api/install", handle_install)
    app.router.add_post("/api/start", handle_start)
    url = f"http://127.0.0.1:{GUI_PORT}"
    print(f"gui wizard on {url}")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    web.run_app(app, host="127.0.0.1", port=GUI_PORT, print=None)
