"""SQLite lease store with atomic reservations and reactivation."""
from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from pathlib import Path

import aiosqlite

from .config import Config


SCHEMA = """
CREATE TABLE IF NOT EXISTS leases (
    id INTEGER PRIMARY KEY,
    egress TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('cf','proxy','browser','account','foreign')),
    budget INTEGER NOT NULL DEFAULT 1,
    reset_at REAL NOT NULL DEFAULT 0,
    strikes INTEGER NOT NULL DEFAULT 0,
    quarantined_until REAL NOT NULL DEFAULT 0,
    last_used REAL NOT NULL DEFAULT 0,
    total_ok INTEGER NOT NULL DEFAULT 0,
    total_fail INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lease_pick ON leases(kind, quarantined_until, budget, last_used);

CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    model TEXT NOT NULL,
    payload TEXT NOT NULL,
    embedding BLOB,
    created REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cache_created ON cache(created);
"""


@dataclass
class Lease:
    id: int
    egress: str
    kind: str
    budget: int
    reset_at: float
    strikes: int
    quarantined_until: float
    last_used: float
    total_ok: int
    total_fail: int


class LeaseStore:
    """Single connection, serialized writes. Never hold a transaction across a network await."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._db: aiosqlite.Connection | None = None
        self._write_lock = asyncio.Lock()

    async def open(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(str(self.db_path))
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL;")
        await self._db.execute("PRAGMA busy_timeout=5000;")
        await self._db.execute("PRAGMA synchronous=NORMAL;")
        await self._db.executescript(SCHEMA)
        await self._db.commit()
        # chmod 0600 after creation
        try:
            os.chmod(self.db_path, 0o600)
        except OSError:
            pass

    async def close(self) -> None:
        if self._db:
            await self._db.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            await self._db.close()
            self._db = None

    @property
    def db(self) -> aiosqlite.Connection:
        if not self._db:
            raise RuntimeError("LeaseStore not open")
        return self._db

    async def seed(self, config: Config) -> None:
        """INSERT OR IGNORE leases from config. foreign leases always budget=999999."""
        async with self._write_lock:
            # account identities: each is a separate quota slot (fresh distinct-id
            # and attestation per request). A 429 on one hops to the next.
            for i in range(16):
                await self.db.execute(
                    "INSERT OR IGNORE INTO leases (egress, kind, budget) VALUES (?, ?, ?)",
                    (f"account:{i}", "account", 1),
                )
            # cf workers
            for i, url in enumerate(config.cf_workers):
                egress = f"cf:{url}"
                await self.db.execute(
                    "INSERT OR IGNORE INTO leases (egress, kind, budget) VALUES (?, ?, ?)",
                    (egress, "cf", 1),
                )
            # proxies
            for proxy in config.proxies:
                await self.db.execute(
                    "INSERT OR IGNORE INTO leases (egress, kind, budget) VALUES (?, ?, ?)",
                    (proxy, "proxy", 1),
                )
            # browser
            if config.browser_enabled:
                await self.db.execute(
                    "INSERT OR IGNORE INTO leases (egress, kind, budget) VALUES (?, ?, ?)",
                    ("chrome:0", "browser", 1),
                )
            # foreign
            if config.foreign_base_url:
                await self.db.execute(
                    "INSERT OR IGNORE INTO leases (egress, kind, budget) VALUES (?, ?, ?)",
                    ("foreign:or", "foreign", 999999),
                )
            await self.db.commit()

    async def reactivate(self, now: float | None = None) -> None:
        """Reactivation at the top of every acquire: reset expired zero-budget leases."""
        now = now if now is not None else time.time()
        async with self._write_lock:
            await self.db.execute(
                """
                UPDATE leases SET budget = 1, strikes = 0, quarantined_until = 0
                WHERE reset_at > 0 AND reset_at < ? AND budget = 0
                """,
                (now,),
            )
            await self.db.commit()

    async def reserve(self, lease_id: int, now: float | None = None) -> bool:
        """Atomically decrement budget. Returns True if reservation succeeded (rowcount > 0)."""
        now = now if now is not None else time.time()
        async with self._write_lock:
            cur = await self.db.execute(
                """
                UPDATE leases SET budget = budget - 1, last_used = ?
                WHERE id = ? AND (budget > 0 OR kind = 'foreign')
                """,
                (now, lease_id),
            )
            await self.db.commit()
            return cur.rowcount > 0

    async def refund(self, lease_id: int) -> None:
        """Refund a reservation on pre-first-byte failure."""
        async with self._write_lock:
            await self.db.execute(
                "UPDATE leases SET budget = budget + 1 WHERE id = ?",
                (lease_id,),
            )
            await self.db.commit()

    async def reconcile(self, lease_id: int, remaining: int) -> None:
        """Set budget to x-ratelimit-remaining. The header always beats the local counter."""
        async with self._write_lock:
            await self.db.execute(
                "UPDATE leases SET budget = ? WHERE id = ?",
                (max(0, int(remaining)), lease_id),
            )
            await self.db.commit()

    async def finish_ok(self, lease_id: int, remaining: int | None, reset_at: float | None) -> None:
        """One transaction: count the success, adopt remaining, record a future reset."""
        now = time.time()
        async with self._write_lock:
            await self.db.execute(
                "UPDATE leases SET total_ok = total_ok + 1 WHERE id = ?",
                (lease_id,),
            )
            if remaining is not None:
                await self.db.execute(
                    "UPDATE leases SET budget = ? WHERE id = ?",
                    (max(0, int(remaining)), lease_id),
                )
            if reset_at is not None and reset_at > now:
                await self.db.execute(
                    "UPDATE leases SET reset_at = ? WHERE id = ?",
                    (reset_at, lease_id),
                )
            await self.db.commit()

    async def set_budget_zero(self, lease_id: int, reset_at: float) -> None:
        """On 429: budget=0, reset_at from header (must not be past)."""
        if reset_at <= time.time():
            reset_at = time.time() + 1  # never persist a past reset; caller should pass next 12:01
        async with self._write_lock:
            await self.db.execute(
                "UPDATE leases SET budget = 0, reset_at = ? WHERE id = ?",
                (reset_at, lease_id),
            )
            await self.db.commit()

    async def set_reset(self, lease_id: int, reset_at: float) -> None:
        """Record a future reset_at without touching budget. Never writes a past timestamp."""
        if reset_at <= time.time():
            return
        async with self._write_lock:
            await self.db.execute(
                "UPDATE leases SET reset_at = ? WHERE id = ?",
                (reset_at, lease_id),
            )
            await self.db.commit()

    async def set_quarantine(self, lease_id: int, until: float) -> None:
        """Set quarantine window without incrementing strikes."""
        async with self._write_lock:
            await self.db.execute(
                "UPDATE leases SET quarantined_until = ? WHERE id = ?",
                (until, lease_id),
            )
            await self.db.commit()

    async def reset_all_non_foreign(self) -> None:
        """Warmer: budget=1, clear strikes and quarantine. Foreign stays at 999999."""
        async with self._write_lock:
            await self.db.execute(
                "UPDATE leases SET budget = 1, strikes = 0, quarantined_until = 0 WHERE kind != 'foreign'"
            )
            await self.db.execute(
                "UPDATE leases SET budget = 999999, strikes = 0, quarantined_until = 0 WHERE kind = 'foreign'"
            )
            await self.db.commit()

    async def add_strike(self, lease_id: int, quarantine_until: float | None = None) -> int:
        """Increment strikes. Optionally set quarantine. Returns new strike count."""
        async with self._write_lock:
            if quarantine_until is not None:
                await self.db.execute(
                    "UPDATE leases SET strikes = strikes + 1, quarantined_until = ? WHERE id = ?",
                    (quarantine_until, lease_id),
                )
            else:
                await self.db.execute(
                    "UPDATE leases SET strikes = strikes + 1 WHERE id = ?",
                    (lease_id,),
                )
            await self.db.commit()
            row = await self.db.execute_fetchall(
                "SELECT strikes FROM leases WHERE id = ?", (lease_id,)
            )
            return int(row[0][0]) if row else 0

    async def record_ok(self, lease_id: int) -> None:
        async with self._write_lock:
            await self.db.execute(
                "UPDATE leases SET total_ok = total_ok + 1 WHERE id = ?",
                (lease_id,),
            )
            await self.db.commit()

    async def record_fail(self, lease_id: int) -> None:
        async with self._write_lock:
            await self.db.execute(
                "UPDATE leases SET total_fail = total_fail + 1 WHERE id = ?",
                (lease_id,),
            )
            await self.db.commit()

    async def get(self, lease_id: int) -> Lease | None:
        rows = await self.db.execute_fetchall(
            "SELECT * FROM leases WHERE id = ?", (lease_id,)
        )
        if not rows:
            return None
        r = rows[0]
        return Lease(
            id=r["id"], egress=r["egress"], kind=r["kind"], budget=r["budget"],
            reset_at=r["reset_at"], strikes=r["strikes"],
            quarantined_until=r["quarantined_until"], last_used=r["last_used"],
            total_ok=r["total_ok"], total_fail=r["total_fail"],
        )

    async def list_eligible(self, now: float, exclude: set[int] | None = None) -> list[Lease]:
        """Eligible leases: not quarantined, ordered budget DESC, last_used ASC."""
        exclude = exclude or set()
        rows = await self.db.execute_fetchall(
            """
            SELECT * FROM leases
            WHERE quarantined_until <= ? AND (budget > 0 OR kind = 'foreign')
            ORDER BY budget DESC, last_used ASC
            """,
            (now,),
        )
        result = []
        for r in rows:
            if r["id"] in exclude:
                continue
            result.append(Lease(
                id=r["id"], egress=r["egress"], kind=r["kind"], budget=r["budget"],
                reset_at=r["reset_at"], strikes=r["strikes"],
                quarantined_until=r["quarantined_until"], last_used=r["last_used"],
                total_ok=r["total_ok"], total_fail=r["total_fail"],
            ))
        return result

    async def list_by_kind(self, kind: str) -> list[Lease]:
        rows = await self.db.execute_fetchall(
            "SELECT * FROM leases WHERE kind = ? ORDER BY id", (kind,)
        )
        return [
            Lease(
                id=r["id"], egress=r["egress"], kind=r["kind"], budget=r["budget"],
                reset_at=r["reset_at"], strikes=r["strikes"],
                quarantined_until=r["quarantined_until"], last_used=r["last_used"],
                total_ok=r["total_ok"], total_fail=r["total_fail"],
            )
            for r in rows
        ]

    async def all_leases(self) -> list[Lease]:
        rows = await self.db.execute_fetchall("SELECT * FROM leases ORDER BY id")
        return [
            Lease(
                id=r["id"], egress=r["egress"], kind=r["kind"], budget=r["budget"],
                reset_at=r["reset_at"], strikes=r["strikes"],
                quarantined_until=r["quarantined_until"], last_used=r["last_used"],
                total_ok=r["total_ok"], total_fail=r["total_fail"],
            )
            for r in rows
        ]
