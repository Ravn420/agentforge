"""First-run wizard. Guides setup end to end with defaults that work.

Run with `python -m venice wizard`. No file editing is required.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from .config import DEFAULT_CONFIG_PATH, _chrome_present, ensure_config, load
from .models_free import free_models


def _ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        raw = input(f"{prompt}{suffix}: ").strip()
    except EOFError:
        return default
    return raw or default


def _yes(prompt: str, default: bool = True) -> bool:
    mark = "Y/n" if default else "y/N"
    raw = _ask(f"{prompt} ({mark})", "y" if default else "n").lower()
    if not raw:
        return default
    return raw in ("y", "yes", "1")


def _step(n: int, title: str) -> None:
    print(f"\n── {n}. {title}")


def _check_python() -> bool:
    ok = sys.version_info >= (3, 11)
    print(f"  python {sys.version.split()[0]}  {'ok' if ok else 'need 3.11+'}")
    return ok


def _check_dep(name: str) -> bool:
    try:
        __import__(name)
        print(f"  {name}  ok")
        return True
    except Exception:
        print(f"  {name}  missing")
        return False


def run() -> None:
    print("venice-lane wizard")
    print("This sets up a local OpenAI-compatible proxy in front of Venice's free models.")
    print("Press enter to accept every default. Nothing has to be edited by hand.")

    _step(1, "checks")
    py_ok = _check_python()
    deps = {"aiohttp": True, "aiosqlite": True, "curl_cffi": True}
    missing = [n for n in deps if not _check_dep(n)]
    if missing:
        print(f"\n  missing: {', '.join(missing)}")
        if _yes("install them now with pip"):
            req = Path(__file__).resolve().parent / "requirements.txt"
            cmd = [sys.executable, "-m", "pip", "install", "-r", str(req)]
            print(f"  running: {' '.join(cmd)}")
            subprocess.check_call(cmd)
            print("  installed")
        else:
            print("  install later with: python3 -m pip install -r requirements.txt")
    if not py_ok:
        print("\nPython 3.11+ is required. Upgrade Python, then re-run the wizard.")
        return

    _step(2, "local proxy")
    print("  the proxy binds 127.0.0.1 only. clients on this machine talk to it.")
    ensure_config()
    cfg = load()
    print(f"  config: {DEFAULT_CONFIG_PATH}")
    print(f"  port:   {cfg.port}")
    print(f"  key:    {cfg.bearer}")
    print(f"  model:  {cfg.model}")

    _step(3, "free models")
    print("  any of these work. the model you ask for is the one you get.")
    for m in free_models():
        mark = "  (default)" if m == cfg.model else ""
        print(f"    {m}{mark}")
    print("  a rate limit on one identity is hopped to the next. you do not see it.")

    _step(4, "egress")
    chrome = _chrome_present()
    print(f"  account identities: 16 slots on this machine's IP")
    print(f"  chrome: {'found, browser lane on' if chrome else 'not found, browser lane off'}")
    print("  one IP has a daily free cap. more IPs make it continuous.")
    if _yes("add Cloudflare workers for extra IPs", default=False):
        print("  optional later. from the project dir:")
        print("    export CF_API_TOKEN=... CF_ACCOUNT_ID=... VENICE_KEY=" + cfg.bearer)
        print("    ./workers/deploy.sh 4")
        print("  paste the printed URLs into config.toml under cf_workers.")
        print("  skip this and the proxy still runs on this machine.")
    else:
        print("  skipped. this machine's IP is enough to start.")

    _step(5, "client")
    base = f"http://127.0.0.1:{cfg.port}/v1"
    print("  in any OpenAI-compatible client:")
    print(f"    base url: {base}")
    print(f"    api key:  {cfg.bearer}")
    print(f"    model:    {cfg.model}")
    print("\n  or:")
    print(f"    curl {base}/chat/completions \\")
    print(f"      -H 'Authorization: Bearer {cfg.bearer}' \\")
    print("      -H 'Content-Type: application/json' \\")
    print(f"      -d '{{\"model\":\"{cfg.model}\",\"messages\":[{{\"role\":\"user\",\"content\":\"hi\"}}]}}'")

    _step(6, "start")
    if _yes("start the proxy now"):
        print("  starting. leave this running. Ctrl-C stops it.\n")
        from .cli import cmd_serve
        import asyncio

        class _A:
            pass

        asyncio.run(cmd_serve(_A()))
    else:
        print("\n  start later with:")
        print("    PYTHONPATH=/workspace/artifacts python3 -m venice")
        print(f"\n  base url {base}")
        print(f"  api key  {cfg.bearer}")
