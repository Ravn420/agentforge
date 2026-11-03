"""SQLite persistence for AgentForge.

The schema is derived from ``entities/*.jsonc`` — those files are the source of
truth for field names and enums. ``src/types/index.ts`` is kept in sync with
this module (see ``scripts/sync_types.py``).

No ORM: the surface is small enough that explicit SQL is easier to audit than a
mapping layer, and it keeps the dependency list short.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import AsyncIterator

import aiosqlite

from .config import settings

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    role        TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('admin', 'user')),
    email       TEXT,
    name        TEXT,
    avatar_url  TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_settings (
    id                       TEXT PRIMARY KEY,
    provider                 TEXT NOT NULL
                             CHECK (provider IN ('bedrock', 'openrouter')),
    aws_region               TEXT NOT NULL DEFAULT 'us-east-1',
    openrouter_default_model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4.5',
    bedrock_default_model    TEXT NOT NULL DEFAULT 'anthropic.claude-sonnet-4-5',
    is_active                INTEGER NOT NULL DEFAULT 1,
    created_by_id            TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at               TEXT NOT NULL,
    UNIQUE (provider)
);

CREATE TABLE IF NOT EXISTS tasks (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL,
    goal                TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed')),
    autonomy_level      TEXT NOT NULL DEFAULT 'full_auto'
                        CHECK (autonomy_level IN ('full_auto', 'confirm_each_step', 'manual')),
    max_steps           INTEGER NOT NULL DEFAULT 10,
    provider            TEXT NOT NULL DEFAULT 'openrouter'
                        CHECK (provider IN ('bedrock', 'openrouter')),
    model_id            TEXT,
    final_summary       TEXT,
    error_message       TEXT,
    time_budget_minutes INTEGER NOT NULL DEFAULT 30,
    created_by_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS task_steps (
    id           TEXT PRIMARY KEY,
    task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    order_index  INTEGER NOT NULL DEFAULT 0,
    title        TEXT NOT NULL,
    description  TEXT,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
    output       TEXT,
    retry_count  INTEGER NOT NULL DEFAULT 0,
    started_at   TEXT,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_steps_task ON task_steps(task_id, order_index);

CREATE TABLE IF NOT EXISTS chat_messages (
    id             TEXT PRIMARY KEY,
    task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    role           TEXT NOT NULL DEFAULT 'user'
                   CHECK (role IN ('user', 'agent', 'system')),
    content        TEXT NOT NULL,
    created_by_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_task ON chat_messages(task_id, created_at);

CREATE TABLE IF NOT EXISTS deliverables (
    id             TEXT PRIMARY KEY,
    task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    file_type      TEXT NOT NULL DEFAULT 'text'
                   CHECK (file_type IN ('text', 'markdown', 'code', 'csv', 'json')),
    content        TEXT,
    storage_url    TEXT,
    size_bytes     INTEGER NOT NULL DEFAULT 0,
    created_by_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliverables_task ON deliverables(task_id, created_at);

CREATE TABLE IF NOT EXISTS provider_calls (
    id            TEXT PRIMARY KEY,
    task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL CHECK (provider IN ('bedrock', 'openrouter')),
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms    INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'success'
                  CHECK (status IN ('success', 'error')),
    error         TEXT,
    created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provider_calls_task ON provider_calls(task_id, created_at);

CREATE TABLE IF NOT EXISTS task_attachments (
    id             TEXT PRIMARY KEY,
    task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    extracted_text TEXT,
    file_url       TEXT,
    size_bytes     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_task ON task_attachments(task_id);
"""


async def connect() -> aiosqlite.Connection:
    """Open a connection with row access by name and FK enforcement on."""
    settings.database_dir.mkdir(parents=True, exist_ok=True)
    conn = await aiosqlite.connect(settings.database_path)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA foreign_keys = ON")
    await conn.execute("PRAGMA journal_mode = WAL")
    return conn


async def init_db(conn: aiosqlite.Connection) -> None:
    await conn.executescript(SCHEMA)
    await conn.commit()


async def close_db(conn: aiosqlite.Connection) -> None:
    await conn.close()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def is_within(path: Path, root: Path) -> bool:
    """True when ``path`` resolves inside ``root`` (guards the tool sandbox)."""
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


__all__ = [
    "SCHEMA",
    "connect",
    "init_db",
    "close_db",
    "ensure_parent",
    "is_within",
    "sqlite3",
    "AsyncIterator",
]
