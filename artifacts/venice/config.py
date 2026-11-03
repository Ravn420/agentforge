"""Configuration loading and validation for venice-lane.

Zero-config: if ~/.config/venice-lane/config.toml is missing, one is written
with a generated bearer, the account lane on, and the browser lane on when
Chrome is installed. Optional env vars override the file without editing it.
"""
from __future__ import annotations

import os
import secrets
import shutil
from dataclasses import dataclass
from pathlib import Path

try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore


VALID_LANES = frozenset({"cf", "account", "proxy", "browser", "foreign"})
DEFAULT_CONFIG_PATH = Path.home() / ".config" / "venice-lane" / "config.toml"
DEFAULT_DB_PATH = Path.home() / ".config" / "venice-lane" / "state.db"


def _chrome_present() -> bool:
    return any(shutil.which(n) for n in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"))


def _split_env(name: str) -> tuple[str, ...]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return ()
    return tuple(p.strip() for p in raw.split(",") if p.strip())


def ensure_config(path: Path | None = None) -> Path:
    """Write a working config if none exists. Returns the path. Idempotent."""
    cfg_path = path or DEFAULT_CONFIG_PATH
    if cfg_path.exists():
        return cfg_path
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    bearer = secrets.token_urlsafe(24)
    browser = _chrome_present()
    lanes = '["account"' + (', "browser"]' if browser else "]")
    body = (
        f"# auto-generated on first run. you do not need to edit this.\n"
        f"bearer = \"{bearer}\"\n"
        f"model = \"deepseek-v4-1-flash-free\"\n"
        f"port = 8000\n"
        f"lane_order = {lanes}\n"
        f"browser_enabled = {'true' if browser else 'false'}\n"
        f"browser_hold_reserve = true\n"
    )
    cfg_path.write_text(body, encoding="utf-8")
    try:
        os.chmod(cfg_path, 0o600)
    except OSError:
        pass
    print(f"created {cfg_path}")
    return cfg_path


@dataclass(frozen=True)
class Config:
    bearer: str
    model: str = "deepseek-v4-1-flash-free"
    port: int = 8000
    lane_order: tuple[str, ...] = ("cf", "account", "proxy", "browser", "foreign")
    cf_workers: tuple[str, ...] = ()
    proxies: tuple[str, ...] = ()
    browser_enabled: bool = False
    browser_hold_reserve: bool = True
    foreign_base_url: str | None = None
    foreign_api_key: str | None = None
    foreign_model: str | None = None
    cache_ttl_s: int = 86400
    semantic_threshold: float = 0.97
    semantic_min_chars: int = 40
    jitter_ms: tuple[int, int] = (200, 800)
    max_tries: int = 4
    per_ip_pace_s: float = 2.0
    ttfb_timeout_s: float = 12.0
    max_concurrency: int = 8
    breaker_cooldown_s: int = 30
    quarantine_s: int = 600
    max_strikes: int = 3
    browser_idle_timeout_s: int = 60
    db_path: Path = DEFAULT_DB_PATH

    def lane_nonempty(self, lane: str) -> bool:
        if lane == "cf":
            return len(self.cf_workers) > 0
        if lane == "proxy":
            return len(self.proxies) > 0
        if lane == "browser":
            return self.browser_enabled
        if lane == "foreign":
            return bool(self.foreign_base_url)
        if lane == "account":
            return True  # local account is always present if configured
        return False


def load(path: Path | None = None) -> Config:
    """Load config. Creates a default file on first run. Env vars override the file."""
    cfg_path = ensure_config(path or DEFAULT_CONFIG_PATH)

    try:
        raw = tomllib.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"failed to parse {cfg_path}: {exc}") from exc

    bearer = os.environ.get("VENICE_LANE_BEARER", "").strip() or str(raw.get("bearer", "")).strip()
    if not bearer:
        bearer = secrets.token_urlsafe(24)

    lane_order_raw = raw.get("lane_order", ["account"])
    if not isinstance(lane_order_raw, (list, tuple)):
        raise SystemExit("config: lane_order must be a list")
    lane_order = tuple(str(x) for x in lane_order_raw)

    seen: set[str] = set()
    for lane in lane_order:
        if lane not in VALID_LANES:
            raise SystemExit(f"config: invalid lane '{lane}' in lane_order; must be one of {sorted(VALID_LANES)}")
        if lane in seen:
            raise SystemExit(f"config: duplicate lane '{lane}' in lane_order")
        seen.add(lane)

    max_tries = int(raw.get("max_tries", 4))
    if max_tries < 1:
        raise SystemExit("config: max_tries must be >= 1")

    semantic_threshold = float(raw.get("semantic_threshold", 0.97))
    if not (0.0 < semantic_threshold <= 1.0):
        raise SystemExit("config: semantic_threshold must be in (0.0, 1.0]")

    cf_workers = _split_env("VENICE_LANE_CF_WORKERS") or tuple(str(x) for x in raw.get("cf_workers", []))
    proxies = _split_env("VENICE_LANE_PROXIES") or tuple(str(x) for x in raw.get("proxies", []))
    from .proxy_rotate import read_file, with_proxy_lane
    proxies = tuple(dict.fromkeys((*proxies, *read_file())))
    lane_order = with_proxy_lane(lane_order, proxies)
    browser_enabled = _chrome_present() if "browser_enabled" not in raw else bool(raw.get("browser_enabled", False))
    if os.environ.get("VENICE_LANE_BROWSER", "").lower() in ("1", "true", "yes"):
        browser_enabled = True

    foreign_base_url = os.environ.get("VENICE_LANE_FOREIGN_URL") or raw.get("foreign_base_url") or None
    foreign_api_key = os.environ.get("VENICE_LANE_FOREIGN_KEY") or raw.get("foreign_api_key") or None
    foreign_model = os.environ.get("VENICE_LANE_FOREIGN_MODEL") or raw.get("foreign_model") or None

    port = int(os.environ.get("VENICE_LANE_PORT", raw.get("port", 8000)))

    cfg = Config(
        bearer=bearer,
        model=str(raw.get("model", "deepseek-v4-1-flash-free")),
        port=port,
        lane_order=lane_order,
        cf_workers=cf_workers,
        proxies=proxies,
        browser_enabled=browser_enabled,
        browser_hold_reserve=bool(raw.get("browser_hold_reserve", True)),
        foreign_base_url=foreign_base_url,
        foreign_api_key=foreign_api_key,
        foreign_model=foreign_model,
        cache_ttl_s=int(raw.get("cache_ttl_s", 86400)),
        semantic_threshold=semantic_threshold,
        semantic_min_chars=int(raw.get("semantic_min_chars", 40)),
        jitter_ms=tuple(raw.get("jitter_ms", [200, 800])),  # type: ignore
        max_tries=max_tries,
        per_ip_pace_s=float(raw.get("per_ip_pace_s", 2.0)),
        ttfb_timeout_s=float(raw.get("ttfb_timeout_s", 12.0)),
        max_concurrency=int(raw.get("max_concurrency", 8)),
        breaker_cooldown_s=int(raw.get("breaker_cooldown_s", 30)),
        quarantine_s=int(raw.get("quarantine_s", 600)),
        max_strikes=int(raw.get("max_strikes", 3)),
        browser_idle_timeout_s=int(raw.get("browser_idle_timeout_s", 60)),
        db_path=Path(raw.get("db_path", str(DEFAULT_DB_PATH))),
    )

    # account is always usable; that is enough to start with no file edits
    return cfg
