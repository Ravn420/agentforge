"""Tool implementations available to the agent.

Tools are plain async functions registered by name. Each receives a
:class:`ToolContext` carrying the database connection, the owning task, and the
workspace root used for sandbox checks.

Nothing here touches the network except :func:`web_search` and
:func:`fetch_url`, both of which are read-only and SSRF-guarded.
"""
from __future__ import annotations

import json
import re
import socket
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

import httpx

from ...config import settings
from ...db import is_within
from ...errors import (
    BlockedURLError,
    NotFoundError,
    SandboxViolationError,
    ValidationError,
)

ToolHandler = Callable[["ToolContext", dict[str, Any]], Awaitable[str]]


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(slots=True)
class ToolContext:
    """Everything a tool is allowed to know about the running task."""

    conn: Any
    task_id: str
    workspace_root: Path = field(default_factory=lambda: Path(settings.workspace_root))

    async def insert_deliverable(
        self, name: str, file_type: str, content: str | None, storage_url: str | None = None
    ) -> str:
        deliverable_id = uuid.uuid4().hex
        payload = content or ""
        await self.conn.execute(
            """
            INSERT INTO deliverables
                (id, task_id, name, file_type, content, storage_url, size_bytes,
                 created_by_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                deliverable_id,
                self.task_id,
                name,
                file_type,
                content,
                storage_url,
                len(payload.encode("utf-8")),
                utcnow(),
            ),
        )
        await self.conn.commit()
        return deliverable_id


# --------------------------------------------------------------------------
# Registry
# --------------------------------------------------------------------------

REGISTRY: dict[str, ToolHandler] = {}


def tool(name: str) -> Callable[[ToolHandler], ToolHandler]:
    def decorator(handler: ToolHandler) -> ToolHandler:
        REGISTRY[name] = handler
        return handler

    return decorator


def tool_definitions() -> list[dict[str, Any]]:
    """OpenAI-style tool schemas, generated from the registry docstrings."""
    specs: list[dict[str, Any]] = []
    for name, handler in REGISTRY.items():
        specs.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": (handler.__doc__ or "").strip(),
                    "parameters": _parameters_for(name),
                },
            }
        )
    return specs


def _parameters_for(name: str) -> dict[str, Any]:
    """Declared schemas — kept explicit so the model sees stable contracts."""
    schemas: dict[str, dict[str, Any]] = {
        "write_deliverable": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "File name, e.g. report.md"},
                "file_type": {
                    "type": "string",
                    "enum": ["text", "markdown", "code", "csv", "json"],
                    "description": "Content type",
                },
                "content": {"type": "string", "description": "Full file contents"},
            },
            "required": ["name", "file_type", "content"],
        },
        "read_deliverable": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Exact deliverable name"}
            },
            "required": ["name"],
        },
        "list_deliverables": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task to inspect (defaults to current)"}
            },
        },
        "web_search": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Search query"}},
            "required": ["query"],
        },
        "fetch_url": {
            "type": "object",
            "properties": {"url": {"type": "string", "description": "Absolute http(s) URL"}},
            "required": ["url"],
        },
        "finalize_task": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Final summary for the user"}
            },
            "required": ["summary"],
        },
        "update_step": {
            "type": "object",
            "properties": {
                "step_id": {"type": "string"},
                "status": {
                    "type": "string",
                    "enum": ["pending", "running", "done", "failed", "skipped"],
                },
                "output": {"type": "string"},
            },
            "required": ["step_id", "status"],
        },
        "list_steps": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task to inspect (defaults to current)"}
            },
        },
    }
    return schemas.get(name, {"type": "object", "properties": {}})


# --------------------------------------------------------------------------
# Deliverable tools
# --------------------------------------------------------------------------


@tool("write_deliverable")
async def write_deliverable(ctx: ToolContext, args: dict[str, Any]) -> str:
    """Write a deliverable file for the task. Returns the new deliverable id."""
    name = str(args.get("name") or "").strip()
    if not name:
        raise ValidationError("write_deliverable requires a 'name'")
    file_type = str(args.get("file_type") or "text")
    content = args.get("content")
    if content is None:
        raise ValidationError("write_deliverable requires 'content'")
    content = str(content)

    # Guard against path traversal via the name field.
    candidate = (ctx.workspace_root / name).name
    if "/" in name or "\\" in name or name in {".", ".."}:
        raise SandboxViolationError(f"deliverable name must be a plain file name, got {name!r}")
    _ = candidate

    deliverable_id = await ctx.insert_deliverable(name, file_type, content, None)
    return json.dumps(
        {"id": deliverable_id, "name": name, "file_type": file_type, "size_bytes": len(content.encode())}
    )


@tool("read_deliverable")
async def read_deliverable(ctx: ToolContext, args: dict[str, Any]) -> str:
    """Read back a previously written deliverable by name."""
    name = str(args.get("name") or "").strip()
    if not name:
        raise ValidationError("read_deliverable requires a 'name'")
    row = await _fetch_one(
        ctx.conn,
        "SELECT id, name, file_type, content FROM deliverables WHERE task_id = ? AND name = ? "
        "ORDER BY created_at DESC LIMIT 1",
        (ctx.task_id, name),
    )
    if row is None:
        raise NotFoundError("Deliverable", name)
    content = row["content"] or ""
    return json.dumps(
        {
            "id": row["id"],
            "name": row["name"],
            "file_type": row["file_type"],
            "size_bytes": len(content.encode()),
            "content": content[:20_000],
        }
    )


@tool("list_deliverables")
async def list_deliverables(ctx: ToolContext, args: dict[str, Any]) -> str:
    """List deliverables already produced, optionally for another task."""
    task_id = str(args.get("task_id") or ctx.task_id)
    rows = await _fetch_all(
        ctx.conn,
        "SELECT id, name, file_type, size_bytes, created_at FROM deliverables "
        "WHERE task_id = ? ORDER BY created_at",
        (task_id,),
    )
    return json.dumps([dict(row) for row in rows])


# --------------------------------------------------------------------------
# Research tools
# --------------------------------------------------------------------------


@tool("web_search")
async def web_search(ctx: ToolContext, args: dict[str, Any]) -> str:
    """Search the web (DuckDuckGo Lite) and return up to 10 results with snippets."""
    query = str(args.get("query") or "").strip()
    if not query:
        raise ValidationError("web_search requires a 'query'")

    url = "https://lite.duckduckgo.com/lite/"
    headers = {"User-Agent": "Mozilla/5.0 (AgentForge research client)"}
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.post(url, data={"q": query}, headers=headers)

    if response.status_code != 200:
        return json.dumps({"error": f"search returned {response.status_code}", "results": []})

    results = _parse_ddg_lite(response.text)
    return json.dumps({"query": query, "count": len(results), "results": results})


@tool("fetch_url")
async def fetch_url(ctx: ToolContext, args: dict[str, Any]) -> str:
    """Fetch a public URL and return its visible text (truncated)."""
    raw = str(args.get("url") or "").strip()
    if not raw:
        raise ValidationError("fetch_url requires a 'url'")
    _assert_public_url(raw)

    headers = {"User-Agent": "Mozilla/5.0 (AgentForge research client)"}
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as headers_client:
        response = await headers_client.get(raw, headers=headers)

    if response.status_code != 200:
        return json.dumps({"error": f"HTTP {response.status_code}", "url": raw, "text": ""})

    body = response.text[: settings.max_url_response_bytes]
    return json.dumps(
        {
            "url": raw,
            "status": response.status_code,
            "text": _html_to_text(body)[:12_000],
        }
    )


# --------------------------------------------------------------------------
# Task/step tools
# --------------------------------------------------------------------------


@tool("list_steps")
async def list_steps(ctx: ToolContext, args: dict[str, Any]) -> str:
    """List the plan steps for a task with their current status."""
    task_id = str(args.get("task_id") or ctx.task_id)
    rows = await _fetch_all(
        ctx.conn,
        "SELECT id, order_index, title, status, retry_count FROM task_steps "
        "WHERE task_id = ? ORDER BY order_index",
        (task_id,),
    )
    return json.dumps([dict(row) for row in rows])


@tool("update_step")
async def update_step(ctx: ToolContext, args: dict[str, Any]) -> str:
    """Update a step's status or output. Use to mark progress as you work."""
    step_id = str(args.get("step_id") or "").strip()
    if not step_id:
        raise ValidationError("update_step requires a 'step_id'")
    status = args.get("status")
    output = args.get("output")

    row = await _fetch_one(ctx.conn, "SELECT id FROM task_steps WHERE id = ?", (step_id,))
    if row is None:
        raise NotFoundError("TaskStep", step_id)

    if status is not None:
        valid = {"pending", "running", "done", "failed", "skipped"}
        if status not in valid:
            raise ValidationError(f"status must be one of {sorted(valid)}")
        completed_at = utcnow() if status in {"done", "failed", "skipped"} else None
        await ctx.conn.execute(
            "UPDATE task_steps SET status = ?, completed_at = ? WHERE id = ?",
            (status, completed_at, step_id),
        )
    if output is not None:
        await ctx.conn.execute(
            "UPDATE task_steps SET output = ? WHERE id = ?", (str(output), step_id)
        )
    await ctx.conn.commit()
    return json.dumps({"updated": step_id, "status": status})


@tool("finalize_task")
async def finalize_task(ctx: ToolContext, args: dict[str, Any]) -> str:
    """Mark the task complete with a final summary. Call this when the goal is met."""
    summary = str(args.get("summary") or "").strip()
    if not summary:
        raise ValidationError("finalize_task requires a 'summary'")

    row = await _fetch_one(ctx.conn, "SELECT status FROM tasks WHERE id = ?", (ctx.task_id,))
    if row is None:
        raise NotFoundError("Task", ctx.task_id)

    await ctx.conn.execute(
        "UPDATE tasks SET status = 'completed', final_summary = ?, updated_at = ? WHERE id = ?",
        (summary, utcnow(), ctx.task_id),
    )
    await ctx.conn.execute(
        "INSERT INTO chat_messages (id, task_id, role, content, created_by_id, created_at) "
        "VALUES (?, ?, 'agent', ?, NULL, ?)",
        (uuid.uuid4().hex, ctx.task_id, summary, utcnow()),
    )
    await ctx.conn.commit()
    return json.dumps({"task_id": ctx.task_id, "status": "completed"})


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

_BLOCKED_SCHEMES = {"file", "ftp", "gopher", "data", "javascript"}


def _assert_public_url(raw: str) -> None:
    """Refuse private, loopback, and link-local targets (SSRF guard)."""
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        raise BlockedURLError(f"only http(s) URLs are allowed, got {parsed.scheme!r}")
    host = parsed.hostname
    if not host:
        raise BlockedURLError("URL has no host")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise BlockedURLError(f"could not resolve host {host!r}") from exc

    for info in infos:
        address = str(info[4][0])
        ip = _coerce_ip(address)
        if ip is None:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise BlockedURLError(f"host {host!r} resolves to a non-public address ({address})")


def _coerce_ip(address: str):
    import ipaddress

    try:
        return ipaddress.ip_address(address)
    except ValueError:
        return None


def _parse_ddg_lite(html: str) -> list[dict[str, str]]:
    """Minimal DuckDuckGo Lite parser: pulls result links and snippets."""
    results: list[dict[str, str]] = []
    seen: set[str] = set()

    for match in re.finditer(r'<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.S):
        url, title_html = match.group(1), match.group(2)
        if url.startswith("//duckduckgo.com/l/"):
            continue
        if url in seen:
            continue
        seen.add(url)
        results.append({"title": _strip_tags(title_html), "url": url, "snippet": ""})
        if len(results) >= 10:
            return results

    snippet_blocks = re.findall(r'class="result-snippet"[^>]*>(.*?)</td>', html, re.S)
    for index, block in enumerate(snippet_blocks):
        if index < len(results):
            results[index]["snippet"] = _strip_tags(block)[:400]
    return results


def _strip_tags(markup: str) -> str:
    text = re.sub(r"<[^>]+>", " ", markup)
    text = text.replace("&amp;", "&").replace("&quot;", '"').replace("&#x27;", "'")
    return re.sub(r"\s+", " ", text).strip()


def _html_to_text(html: str) -> str:
    without_scripts = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", without_scripts)
    text = text.replace("&amp;", "&").replace("&quot;", '"').replace("&#x27;", "'").replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", text).strip()


async def _fetch_one(conn: Any, sql: str, params: tuple = ()) -> Any:
    async with conn.execute(sql, params) as cursor:
        return await cursor.fetchone()


async def _fetch_all(conn: Any, sql: str, params: tuple = ()) -> list[Any]:
    async with conn.execute(sql, params) as cursor:
        return list(await cursor.fetchall())


async def execute_tool(
    ctx: ToolContext, name: str, arguments: dict[str, Any]
) -> tuple[bool, str]:
    """Dispatch a tool call, returning ``(ok, result_text)``."""
    handler = REGISTRY.get(name)
    if handler is None:
        return False, f"unknown tool: {name}"
    try:
        result = await handler(ctx, arguments)
        return True, result
    except Exception as exc:  # noqa: BLE001 - tool errors must reach the model
        return False, f"{type(exc).__name__}: {exc}"


__all__ = [
    "REGISTRY",
    "ToolContext",
    "tool",
    "tool_definitions",
    "execute_tool",
    "utcnow",
    "is_within",
]
