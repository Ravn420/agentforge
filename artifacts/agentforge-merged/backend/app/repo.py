"""Small row-level helpers over aiosqlite.

Keeps SQL out of the engine and routers without pulling in an ORM. Every helper
takes the connection explicitly so callers control transaction boundaries.
"""
from __future__ import annotations

from typing import Any, Iterable, Sequence

import aiosqlite


async def fetch_one(conn: aiosqlite.Connection, sql: str, params: Sequence[Any] = ()) -> Any:
    async with conn.execute(sql, tuple(params)) as cursor:
        return await cursor.fetchone()


async def fetch_all(conn: aiosqlite.Connection, sql: str, params: Sequence[Any] = ()) -> list[Any]:
    async with conn.execute(sql, tuple(params)) as cursor:
        return list(await cursor.fetchall())


async def fetch_scalar(conn: aiosqlite.Connection, sql: str, params: Sequence[Any] = ()) -> Any:
    row = await fetch_one(conn, sql, params)
    if row is None:
        return None
    try:
        return row[0]
    except (IndexError, KeyError, TypeError):
        return None


async def insert(conn: aiosqlite.Connection, table: str, values: dict[str, Any]) -> int:
    """INSERT a single row; returns the rowcount."""
    columns = ", ".join(values)
    placeholders = ", ".join("?" for _ in values)
    async with conn.execute(
        f"INSERT INTO {table} ({columns}) VALUES ({placeholders})",
        tuple(values.values()),
    ) as cursor:
        return cursor.rowcount


async def update(
    conn: aiosqlite.Connection, table: str, row_id: str, values: dict[str, Any], id_column: str = "id"
) -> int:
    assignments = ", ".join(f"{column} = ?" for column in values)
    async with conn.execute(
        f"UPDATE {table} SET {assignments} WHERE {id_column} = ?",
        tuple(values.values()) + (row_id,),
    ) as cursor:
        return cursor.rowcount


async def delete(
    conn: aiosqlite.Connection, table: str, row_id: str, id_column: str = "id"
) -> int:
    async with conn.execute(f"DELETE FROM {table} WHERE {id_column} = ?", (row_id,)) as cursor:
        return cursor.rowcount


async def count(conn: aiosqlite.Connection, table: str, where: str = "", params: Sequence[Any] = ()) -> int:
    sql = f"SELECT COUNT(*) FROM {table}"
    if where:
        sql += f" WHERE {where}"
    return int(await fetch_scalar(conn, sql, params) or 0)


def as_dict(row: Any) -> dict[str, Any]:
    """Convert an aiosqlite.Row (or mapping) to a plain dict."""
    if row is None:
        return {}
    if hasattr(row, "keys"):
        return {key: row[key] for key in row.keys()}
    return dict(row)


def as_dicts(rows: Iterable[Any]) -> list[dict[str, Any]]:
    return [as_dict(row) for row in rows]


__all__ = [
    "fetch_one",
    "fetch_all",
    "fetch_scalar",
    "insert",
    "update",
    "delete",
    "count",
    "as_dict",
    "as_dicts",
]
