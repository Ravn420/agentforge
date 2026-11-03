"""Task planning.

Turns a free-text goal into an ordered list of concrete steps. The LLM is asked
for a JSON plan; when no provider is configured (or the call fails) the planner
falls back to a deterministic decomposition so the pipeline still produces a
usable plan instead of dead-ending.

The fallback is deliberately boring: it is a safety net, not a substitute for
the model.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from ..agent.providers import get_provider
from ..agent.tools import utcnow
from ..errors import AgentForgeError
from ..repo import delete, fetch_all, fetch_one, insert
from ..schemas import PlanStepDraft

log = logging.getLogger(__name__)

MAX_STEPS = 25

PLAN_SYSTEM_PROMPT = """\
You are the planning component of an autonomous task runner.

Given a user's goal, produce a short ordered list of concrete steps that will \
accomplish it. Each step must be independently executable and produce an \
observable output.

Rules:
- 2 to 8 steps, no more.
- Each step is 5-15 words, imperative, specific.
- Order matters; later steps may depend on earlier ones.
- Do not include steps that only restate the goal.

Respond with JSON only, no prose, no markdown fences:
{"steps": [{"title": "...", "description": "..."}]}"""


def _heuristic_plan(goal: str) -> list[PlanStepDraft]:
    """Deterministic fallback when no provider is available."""
    cleaned = goal.strip().replace("?", "")
    return [
        PlanStepDraft(
            title="Clarify the objective",
            description=f"Restate the goal in measurable terms: {cleaned[:120]}",
        ),
        PlanStepDraft(
            title="Gather the source material",
            description="Search the web for primary sources and capture the most relevant findings.",
        ),
        PlanStepDraft(
            title="Analyse the material",
            description="Extract the key claims, figures, and disagreements from the sources.",
        ),
        PlanStepDraft(
            title="Draft the deliverable",
            description="Write the structured output with citations to the gathered sources.",
        ),
        PlanStepDraft(
            title="Verify and finalise",
            description="Check the draft against the original goal and correct any gaps.",
        ),
    ]


def _parse_plan(text: str) -> list[PlanStepDraft]:
    """Parse the model's JSON plan, tolerating fences and stray prose."""
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if candidate.lower().startswith("json"):
            candidate = candidate[4:]
        candidate = candidate.strip()

    start, end = candidate.find("{"), candidate.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = candidate[start : end + 1]

    try:
        payload = json.loads(candidate)
    except ValueError as exc:
        raise ValueError(f"planner returned non-JSON: {text[:200]!r}") from exc

    raw_steps = payload.get("steps") if isinstance(payload, dict) else None
    if not isinstance(raw_steps, list) or not raw_steps:
        raise ValueError(f"planner returned no steps: {text[:200]!r}")

    steps: list[PlanStepDraft] = []
    for index, item in enumerate(raw_steps[:MAX_STEPS]):
        if isinstance(item, str):
            steps.append(PlanStepDraft(title=item[:300], description=""))
            continue
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        if not title:
            continue
        description = str(item.get("description") or item.get("detail") or "").strip()
        steps.append(PlanStepDraft(title=title[:300], description=description[:2000]))

    if not steps:
        raise ValueError(f"planner produced no usable steps: {text[:200]!r}")
    return steps


async def build_plan(
    conn: Any,
    task: dict[str, Any],
    query: str,
) -> list[PlanStepDraft]:
    """Produce and persist a plan for ``task``.

    Returns the steps. Existing pending steps are replaced so re-planning is
    idempotent rather than additive.
    """
    task_id = task["id"]
    provider = get_provider(task["provider"])
    model = task.get("model_id") or None

    steps: list[PlanStepDraft] | None = None
    failure: str | None = None

    if provider.configured:  # type: ignore[attr-defined]
        try:
            response = await provider.chat(
                messages=[
                    {"role": "system", "content": PLAN_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            f"Goal: {query}\n\n"
                            f"Constraints: max {task.get('max_steps', 10)} steps, "
                            f"time budget {task.get('time_budget_minutes', 30)} minutes."
                        ),
                    },
                ],
                model=model,
            )
            try:
                steps = _parse_plan(response.content)
            except ValueError as exc:
                failure = str(exc)
                log.warning("plan parse failed for task %s: %s", task_id, exc)
        except AgentForgeError as exc:
            failure = str(exc)
            log.warning("plan provider call failed for task %s: %s", task_id, exc)
    else:
        failure = f"provider '{task['provider']}' is not configured"

    if steps is None:
        if failure:
            log.info("using heuristic plan for task %s (%s)", task_id, failure)
        steps = _heuristic_plan(query)

    await _persist_plan(conn, task_id, steps)
    return steps


async def _persist_plan(conn: Any, task_id: str, steps: list[PlanStepDraft]) -> None:
    """Replace the task's plan with ``steps``.

    Steps that already ran or are running are left alone; only pending steps are
    replaced, so re-planning mid-run does not destroy history.
    """
    existing = await fetch_all(
        conn,
        "SELECT id, status FROM task_steps WHERE task_id = ? ORDER BY order_index",
        (task_id,),
    )
    mutable = [row for row in existing if row["status"] == "pending"]

    for row in mutable:
        await delete(conn, "task_steps", row["id"])

    now = utcnow()
    for index, step in enumerate(steps):
        await insert(
            conn,
            "task_steps",
            {
                "id": uuid.uuid4().hex,
                "task_id": task_id,
                "order_index": index,
                "title": step.title,
                "description": step.description,
                "status": "pending",
                "retry_count": 0,
            },
        )
    _ = now
    await conn.commit()


async def next_pending_step(conn: Any, task_id: str) -> Any:
    """The next step to execute, or ``None`` when the plan is exhausted."""
    return await fetch_one(
        conn,
        "SELECT * FROM task_steps WHERE task_id = ? AND status = 'pending' "
        "ORDER BY order_index LIMIT 1",
        (task_id,),
    )


async def remaining_steps(conn: Any, task_id: str) -> int:
    from ..repo import count

    return await count(conn, "task_steps", "task_id = ? AND status = 'pending'", (task_id,))


__all__ = ["build_plan", "next_pending_step", "remaining_steps", "_heuristic_plan", "utcnow"]
