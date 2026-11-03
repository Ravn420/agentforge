"""The task engine: plans, executes, and reports on autonomous tasks.

Design notes
------------
* **One task in flight per call.** ``execute`` runs until the plan is exhausted,
  the time budget is spent, ``max_steps`` is hit, or the task pauses for
  approval. Callers drive long-running work by polling ``status``.
* **Autonomy is enforced, not requested.** ``full_auto`` runs to completion;
  ``confirm_each_step`` stops after every step and waits for ``approve_step``;
  ``manual`` plans only.
* **Every model call is recorded** as a ``provider_calls`` row — including
  failures — so cost and latency are observable rather than inferred.
* **Tools are the only side effects.** The model cannot touch the filesystem
  outside the sandbox or reach private networks; see ``agent/tools``.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from ..agent.planner import build_plan, next_pending_step, remaining_steps
from ..agent.providers import get_provider
from ..agent.tools import ToolContext, execute_tool, tool_definitions, utcnow
from ..config import settings
from ..errors import AgentForgeError, NotFoundError, TaskPausedError, ValidationError
from ..repo import as_dict, as_dicts, fetch_all, fetch_one, insert, update
from ..schemas import (
    AgentEvent,
    AgentStatus,
    AutonomyLevel,
    CostSummary,
    DeliverableOut,
    PlanStepDraft,
    Provider,
    ResearchRequest,
    ResearchResult,
    ResearchSource,
    StepOut,
    StepStatus,
    TaskOut,
    TaskStatus,
)

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are the execution component of AgentForge, an autonomous task runner.

You work through a plan of steps. For each step:
1. Think about what the step needs.
2. Use the available tools to gather or produce what is required.
3. Call update_step to record the outcome.
4. Call finalize_task with a concise summary when the overall goal is met.

Rules:
- Prefer tools over guessing. Never invent search results, file contents, or URLs.
- If a tool fails, say so plainly and try a different approach before giving up.
- Cite sources by URL when you use fetched material.
- Do not call finalize_task until the goal is genuinely satisfied.
- Keep outputs concise; put long content in deliverables."""


class TaskEngine:
    """Executes tasks against the configured LLM provider."""

    def __init__(self, conn: Any, *, user_id: str | None = None) -> None:
        self.conn = conn
        self.user_id = user_id

    # ------------------------------------------------------------------
    # Planning
    # ------------------------------------------------------------------

    async def plan(self, task_id: str, query: str) -> list[PlanStepDraft]:
        """Generate (or regenerate) the plan for a task."""
        task = await self._get_task(task_id)
        if not query.strip():
            query = task["goal"]
        steps = await build_plan(self.conn, as_dict(task), query)
        await self._record_message(task_id, "system", f"Plan generated: {len(steps)} steps.")
        await self._touch(task_id)
        return steps

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def execute(self, task_id: str) -> None:
        """Run the task until it finishes, pauses, or hits a limit."""
        task = as_dict(await self._get_task(task_id))

        if task["status"] == TaskStatus.completed.value:
            return
        if task["status"] == TaskStatus.running.value:
            raise ValidationError(f"task {task_id} is already running")

        if await remaining_steps(self.conn, task_id) == 0:
            steps = await build_plan(self.conn, task, task["goal"])
            await self._record_message(task_id, "system", f"Plan generated: {len(steps)} steps.")

        await self._set_status(task_id, TaskStatus.running)
        await self._record_message(task_id, "system", "Execution started.")
        started = datetime.now(timezone.utc)

        executed = 0
        try:
            while True:
                if self._budget_exhausted(task, started):
                    await self._fail(
                        task_id, f"time budget of {task['time_budget_minutes']} minutes exceeded"
                    )
                    return

                step = await next_pending_step(self.conn, task_id)
                if step is None:
                    await self._complete(task_id, executed)
                    return

                if task["max_steps"] and executed >= int(task["max_steps"]):
                    await self._fail(task_id, f"max_steps limit of {task['max_steps']} reached")
                    return

                succeeded = await self._run_step(task, as_dict(step))
                executed += 1
                if not succeeded:
                    await self._fail(task_id, f"step failed: {as_dict(step)['title']}")
                    return

                if AutonomyLevel(task["autonomy_level"]) is AutonomyLevel.confirm_each_step:
                    if await remaining_steps(self.conn, task_id) > 0:
                        await self._pause(task_id, "waiting for step approval")
                        return

        except AgentForgeError as exc:
            await self._fail(task_id, str(exc))

    async def approve_step(self, task_id: str, step_id: str) -> None:
        """Resume a ``confirm_each_step`` task by running one approved step."""
        task = as_dict(await self._get_task(task_id))
        if task["status"] != TaskStatus.paused.value:
            raise ValidationError(f"task {task_id} is not paused")

        step = await fetch_one(self.conn, "SELECT * FROM task_steps WHERE id = ?", (step_id,))
        if step is None:
            raise NotFoundError("TaskStep", step_id)
        if step["task_id"] != task_id:
            raise ValidationError(f"step {step_id} does not belong to task {task_id}")
        if step["status"] != StepStatus.pending.value:
            raise ValidationError(f"step {step_id} is not pending (status={step['status']})")

        await self._set_status(task_id, TaskStatus.running)
        await self._record_message(task_id, "system", f"Step approved: {step['title']}")
        succeeded = await self._run_step(task, as_dict(step))
        if not succeeded:
            await self._fail(task_id, f"step failed: {step['title']}")
            return

        if await remaining_steps(self.conn, task_id) > 0:
            await self._pause(task_id, "waiting for step approval")
        else:
            await self._complete(task_id, 1)

    async def pause(self, task_id: str) -> None:
        task = as_dict(await self._get_task(task_id))
        if task["status"] not in {TaskStatus.running.value, TaskStatus.queued.value}:
            raise ValidationError(f"cannot pause a task in status {task['status']!r}")
        await self._pause(task_id, "paused by user")

    async def resume(self, task_id: str) -> None:
        task = as_dict(await self._get_task(task_id))
        if task["status"] != TaskStatus.paused.value:
            raise ValidationError(f"task {task_id} is not paused")
        await self._set_status(task_id, TaskStatus.running)
        await self._record_message(task_id, "system", "Execution resumed.")
        await self.execute(task_id)

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    async def status(self, task_id: str) -> AgentStatus:
        task = as_dict(await self._get_task(task_id))

        steps = as_dicts(
            await fetch_all(
                self.conn,
                "SELECT * FROM task_steps WHERE task_id = ? ORDER BY order_index",
                (task_id,),
            )
        )
        deliverables = as_dicts(
            await fetch_all(
                self.conn,
                "SELECT * FROM deliverables WHERE task_id = ? ORDER BY created_at",
                (task_id,),
            )
        )
        calls = as_dicts(
            await fetch_all(
                self.conn,
                "SELECT * FROM provider_calls WHERE task_id = ? ORDER BY created_at",
                (task_id,),
            )
        )
        messages = as_dicts(
            await fetch_all(
                self.conn,
                "SELECT * FROM chat_messages WHERE task_id = ? ORDER BY created_at",
                (task_id,),
            )
        )

        return AgentStatus(
            task_id=task_id,
            status=TaskStatus(task["status"]),
            plan=[PlanStepDraft(title=row["title"], description=row["description"] or "") for row in steps],
            steps=[StepOut(**row) for row in steps],
            deliverables=[DeliverableOut(**row) for row in deliverables],
            events=self._build_events(steps, calls, messages),
            cost=self._summarise_calls(calls, task_id),
        )

    # ------------------------------------------------------------------
    # Deep research
    # ------------------------------------------------------------------

    async def research(
        self,
        query: str,
        *,
        model: str | None = None,
        runs: int = 3,
        search_provider: str = "duckduckgo",
        task_id: str | None = None,
    ) -> ResearchResult:
        """Run the multi-pass research pipeline and write a report deliverable.

        Each pass searches, reads sources, and accumulates findings; a final
        synthesis call writes the report. The pipeline degrades to a
        source-only summary if no provider is configured.
        """
        if task_id is None:
            task_id = await self._create_research_task(query)
        task = as_dict(await self._get_task(task_id))
        provider = get_provider(task["provider"])
        model = model or task.get("model_id") or None

        ctx = ToolContext(conn=self.conn, task_id=task_id)
        sources: list[ResearchSource] = []
        seen: set[str] = set()

        await self._record_message(task_id, "system", f"Research started: {query}")
        await self._set_status(task_id, TaskStatus.running)

        try:
            for run in range(1, max(1, runs) + 1):
                await self._record_message(task_id, "system", f"Pass {run}/{runs}: searching")
                ok, payload = await execute_tool(ctx, "web_search", {"query": query})
                if not ok:
                    await self._record_message(task_id, "system", f"search failed: {payload}")
                    continue

                found = json.loads(payload).get("results", [])
                for item in found:
                    url = str(item.get("url") or "")
                    if not url or url in seen:
                        continue
                    seen.add(url)
                    sources.append(
                        ResearchSource(
                            title=str(item.get("title") or url)[:300],
                            url=url,
                            snippet=str(item.get("snippet") or "")[:400],
                        )
                    )

            for source in sources[: max(6, runs * 3)]:
                ok, payload = await execute_tool(ctx, "fetch_url", {"url": source.url})
                if ok:
                    data = json.loads(payload)
                    source.snippet = (data.get("text") or source.snippet)[:600]

            report = await self._synthesise(provider, model, query, sources, task_id)
            deliverable_id = await ctx.insert_deliverable(
                name="research-report.md", file_type="markdown", content=report
            )

            await self._record_message(task_id, "agent", report[:4000])
            await self._set_status(task_id, TaskStatus.completed)
            await update(
                self.conn,
                "tasks",
                task_id,
                {"final_summary": f"Research complete: {len(sources)} sources across {runs} passes."},
            )
            await self.conn.commit()

            calls = as_dicts(
                await fetch_all(
                    self.conn,
                    "SELECT * FROM provider_calls WHERE task_id = ? ORDER BY created_at",
                    (task_id,),
                )
            )
            summary = self._summarise_calls(calls, task_id)
            return ResearchResult(
                query=query,
                model=model or provider.default_model,  # type: ignore[attr-defined]
                runs=runs,
                sources=sources,
                report=report,
                deliverable_id=deliverable_id,
                calls=summary.calls,
                input_tokens=summary.input_tokens,
                output_tokens=summary.output_tokens,
            )
        except AgentForgeError as exc:
            await self._fail(task_id, str(exc))
            raise

    async def _synthesise(
        self, provider: Any, model: str | None, query: str, sources: list[ResearchSource], task_id: str
    ) -> str:
        """Write the final report, with a source-only fallback when offline."""
        if not provider.configured:  # type: ignore[attr-defined]
            lines = [f"# Research: {query}", "", "## Sources", ""]
            lines += [f"- [{s.title}]({s.url})" for s in sources]
            lines += ["", "_No provider configured — synthesis skipped._"]
            return "\n".join(lines)

        source_block = "\n".join(
            f"### {index}. {item.title}\n{item.url}\n{item.snippet}" for index, item in enumerate(sources, 1)
        )
        response = await provider.chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You write precise research reports. Cite sources inline by number. "
                        "Flag contradictions explicitly. Never invent a source."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Query: {query}\n\nSources:\n{source_block}\n\nWrite the report in markdown.",
                },
            ],
            model=model,
        )
        return response.content or "_Synthesis returned no content._"

    async def _create_research_task(self, query: str) -> str:
        from ..schemas import TaskCreate

        payload = TaskCreate(
            title=query[:300],
            goal=query,
            provider=Provider.openrouter,
            autonomy_level=AutonomyLevel.full_auto,
        )
        task_id = uuid.uuid4().hex
        now = utcnow()
        await insert(
            self.conn,
            "tasks",
            {
                "id": task_id,
                "title": payload.title,
                "goal": payload.goal,
                "status": TaskStatus.queued.value,
                "autonomy_level": payload.autonomy_level.value,
                "max_steps": payload.max_steps,
                "provider": payload.provider.value,
                "model_id": payload.model_id,
                "time_budget_minutes": payload.time_budget_minutes,
                "created_by_id": self.user_id,
                "created_at": now,
                "updated_at": now,
            },
        )
        await self.conn.commit()
        return task_id

    # ------------------------------------------------------------------
    # Step execution
    # ------------------------------------------------------------------

    async def _run_step(self, task: dict[str, Any], step: dict[str, Any]) -> None:
        task_id = task["id"]
        step_id = step["id"]
        provider = get_provider(task["provider"])
        model = task.get("model_id") or None

        await update(
            self.conn,
            "task_steps",
            step_id,
            {"status": StepStatus.running.value, "started_at": utcnow()},
        )
        await self._touch(task_id)
        await self._record_message(task_id, "system", f"Step started: {step['title']}")

        ctx = ToolContext(conn=self.conn, task_id=task_id)
        history = await self._history(task_id)

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": f"Goal: {task['goal']}"},
            {"role": "system", "content": f"Current step: {step['title']}"},
        ]
        messages += [
            {"role": "system" if row["role"] == "system" else row["role"], "content": row["content"]}
            for row in history[-30:]
        ]

        final_text = ""
        try:
            for iteration in range(settings.max_agent_iterations):
                response = await self._call_provider(provider, model, messages, task_id)
                messages.append(
                    {
                        "role": "assistant",
                        "content": response.content or "",
                        **(
                            {
                                "tool_calls": [
                                    {
                                        "id": call.id,
                                        "type": "function",
                                        "function": {
                                            "name": call.name,
                                            "arguments": json.dumps(call.arguments),
                                        },
                                    }
                                    for call in response.tool_calls
                                ]
                            }
                            if response.tool_calls
                            else {}
                        ),
                    }
                )

                if not response.tool_calls:
                    final_text = response.content
                    break

                for call in response.tool_calls:
                    ok, result = await execute_tool(ctx, call.name, call.arguments)
                    await self._record_message(
                        task_id,
                        "system",
                        f"{'ok' if ok else 'failed'}: {call.name}({json.dumps(call.arguments)[:200]}) -> {result[:300]}",
                    )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.id,
                            "content": result[:8000],
                        }
                    )
            else:
                final_text = final_text or "_Reached iteration limit without a final answer._"

        except AgentForgeError as exc:
            await update(
                self.conn,
                "task_steps",
                step_id,
                {
                    "status": StepStatus.failed.value,
                    "output": f"{type(exc).__name__}: {exc}",
                    "completed_at": utcnow(),
                },
            )
            await self.conn.commit()
            await self._record_message(task_id, "system", f"Step failed: {step['title']} — {exc}")
            return

        await update(
            self.conn,
            "task_steps",
            step_id,
            {"status": StepStatus.done.value, "output": final_text[:20_000], "completed_at": utcnow()},
        )
        await self._record_message(task_id, "agent", final_text[:4000])
        await self._touch(task_id)
        await self.conn.commit()

    async def _call_provider(
        self, provider: Any, model: str | None, messages: list[dict[str, Any]], task_id: str
    ) -> Any:
        """Call the provider and persist a ``provider_calls`` row either way."""
        tools = tool_definitions()
        started = datetime.now(timezone.utc)
        try:
            response = await provider.chat(messages=messages, model=model, tools=tools)
        except AgentForgeError as exc:
            await self._record_call(
                task_id=task_id,
                provider=provider.name,  # type: ignore[attr-defined]
                model=model or "unknown",
                status="error",
                error=str(exc),
                started=started,
            )
            raise

        await self._record_call(
            task_id=task_id,
            provider=provider.name,  # type: ignore[attr-defined]
            model=model or provider.default_model,  # type: ignore[attr-defined]
            status="success",
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            latency_ms=response.latency_ms,
            started=started,
        )
        return response

    async def _record_call(
        self,
        *,
        task_id: str,
        provider: str,
        model: str,
        status: str,
        started: datetime,
        input_tokens: int = 0,
        output_tokens: int = 0,
        latency_ms: int = 0,
        error: str | None = None,
    ) -> None:
        await insert(
            self.conn,
            "provider_calls",
            {
                "id": uuid.uuid4().hex,
                "task_id": task_id,
                "provider": provider,
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms or int(
                    (datetime.now(timezone.utc) - started).total_seconds() * 1000
                ),
                "status": status,
                "error": error,
                "created_at": utcnow(),
            },
        )
        await self.conn.commit()

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    async def _get_task(self, task_id: str) -> Any:
        row = await fetch_one(self.conn, "SELECT * FROM tasks WHERE id = ?", (task_id,))
        if row is None:
            raise NotFoundError("Task", task_id)
        return row

    async def _set_status(self, task_id: str, status: TaskStatus) -> None:
        await self.conn.execute(
            "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?",
            (status.value, utcnow(), task_id),
        )
        await self.conn.commit()

    async def _touch(self, task_id: str) -> None:
        await self.conn.execute(
            "UPDATE tasks SET updated_at = ? WHERE id = ?", (utcnow(), task_id)
        )

    async def _pause(self, task_id: str, reason: str) -> None:
        await self._set_status(task_id, TaskStatus.paused)
        await self._record_message(task_id, "system", reason)

    async def _complete(self, task_id: str, executed: int) -> None:
        await self._set_status(task_id, TaskStatus.completed)
        await update(
            self.conn,
            "tasks",
            task_id,
            {"final_summary": f"Completed {executed} step(s)."},
        )
        await self.conn.commit()
        await self._record_message(task_id, "system", "Task completed.")

    async def _fail(self, task_id: str, message: str) -> None:
        await self._set_status(task_id, TaskStatus.failed)
        await update(self.conn, "tasks", task_id, {"error_message": message[:2000]})
        await self.conn.commit()
        await self._record_message(task_id, "system", f"Task failed: {message}")

    async def _record_message(self, task_id: str, role: str, content: str) -> None:
        if not content.strip():
            return
        await insert(
            self.conn,
            "chat_messages",
            {
                "id": uuid.uuid4().hex,
                "task_id": task_id,
                "role": role,
                "content": content[:50_000],
                "created_by_id": self.user_id,
                "created_at": utcnow(),
            },
        )
        await self.conn.commit()

    async def _history(self, task_id: str) -> list[dict[str, Any]]:
        rows = as_dicts(
            await fetch_all(
                self.conn,
                "SELECT role, content FROM chat_messages WHERE task_id = ? AND role != 'system' "
                "ORDER BY created_at",
                (task_id,),
            )
        )
        return rows

    def _budget_exhausted(self, task: dict[str, Any], started: datetime) -> bool:
        budget = timedelta(minutes=int(task.get("time_budget_minutes") or 30))
        return datetime.now(timezone.utc) - started > budget

    def _summarise_calls(self, calls: list[dict[str, Any]], task_id: str) -> CostSummary:
        return CostSummary(
            task_id=task_id,
            calls=len(calls),
            input_tokens=sum(int(row.get("input_tokens") or 0) for row in calls),
            output_tokens=sum(int(row.get("output_tokens") or 0) for row in calls),
            latency_ms=sum(int(row.get("latency_ms") or 0) for row in calls),
            errors=sum(1 for row in calls if row.get("status") == "error"),
        )

    def _build_events(
        self,
        steps: list[dict[str, Any]],
        calls: list[dict[str, Any]],
        messages: list[dict[str, Any]],
    ) -> list[AgentEvent]:
        """Reconstruct the activity feed from persisted rows.

        Events are derived rather than stored, so the feed survives a restart and
        can never drift from the underlying data.
        """
        events: list[AgentEvent] = []
        for message in messages:
            if message["role"] == "system":
                events.append(AgentEvent(type="info", message=str(message["content"])[:400]))
        for step in steps:
            if step["status"] == StepStatus.done.value:
                events.append(AgentEvent(type="step", message=f"completed: {step['title']}"))
            elif step["status"] == StepStatus.failed.value:
                events.append(AgentEvent(type="error", message=f"failed: {step['title']}"))
        for call in calls:
            label = "error" if call.get("status") == "error" else "tool"
            detail = f"{call['provider']}/{call['model']}"
            if call.get("error"):
                detail += f" — {call['error'][:120]}"
            events.append(AgentEvent(type=label, message=detail))
        for message in messages:
            if message["role"] == "agent":
                events.append(AgentEvent(type="done", message=str(message["content"])[:400]))
        return events[-200:]


__all__ = ["TaskEngine", "TaskPausedError", "TaskOut"]
