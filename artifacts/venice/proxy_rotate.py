"""Round-robin proxy rotation.

A proxy that just failed is skipped. The next live proxy is used.
Nothing here invents a proxy. The list comes from config or proxies.txt.
"""
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

PROXY_FILE = Path.home() / ".config" / "venice-lane" / "proxies.txt"
_SCHEMES = ("http://", "https://", "socks5://", "socks5h://")


def label(url: str) -> str:
    """Host and port only. Credentials stay out of the UI."""
    parsed = urlparse(url)
    host = parsed.hostname or "proxy"
    port = f":{parsed.port}" if parsed.port else ""
    scheme = parsed.scheme or "proxy"
    return f"{scheme} {host}{port}"


def validate(url: str) -> str:
    raw = (url or "").strip()
    if any(c.isspace() for c in raw) or not raw.startswith(_SCHEMES):
        raise ValueError("use http://, https://, or socks5://host:port")
    parsed = urlparse(raw)
    if not parsed.hostname or not parsed.port:
        raise ValueError("proxy needs a host and a port")
    return raw


def read_file(path: Path | None = None) -> tuple[str, ...]:
    file = path or PROXY_FILE
    if not file.exists():
        return ()
    found: list[str] = []
    for line in file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            found.append(validate(line))
        except ValueError:
            continue
    return tuple(dict.fromkeys(found))


def write_file(proxies: tuple[str, ...] | list[str], path: Path | None = None) -> None:
    file = path or PROXY_FILE
    file.parent.mkdir(parents=True, exist_ok=True)
    body = "\n".join(dict.fromkeys(proxies))
    file.write_text((body + "\n") if body else "", encoding="utf-8")
    try:
        os.chmod(file, 0o600)
    except OSError:
        pass


def add(url: str, path: Path | None = None) -> tuple[str, ...]:
    clean = validate(url)
    current = list(read_file(path))
    if clean not in current:
        current.append(clean)
    write_file(current, path)
    return tuple(current)


def with_proxy_lane(lane_order: tuple[str, ...], proxies: tuple[str, ...]) -> tuple[str, ...]:
    """Turn the proxy lane on once at least one proxy exists. Do not reorder the rest."""
    if not proxies or "proxy" in lane_order:
        return lane_order
    if "account" in lane_order:
        i = lane_order.index("account") + 1
        return lane_order[:i] + ("proxy",) + lane_order[i:]
    return ("proxy",) + lane_order


def next_proxy(proxies: list[str], skip: set[str], cursor: int) -> tuple[str | None, int]:
    """Next proxy that is not in skip. Cursor advances so the same one is not reused immediately."""
    live = [p for p in proxies if p not in skip]
    if not live:
        return None, cursor
    pick = live[cursor % len(live)]
    return pick, cursor + 1
