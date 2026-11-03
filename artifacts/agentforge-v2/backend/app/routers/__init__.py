"""Minimal routers so the carnival FastAPI backend can start.

The original routers module was missing from the local carnival copy.
This provides a basic health check and a stub tasks endpoint that uses
the engine when available. Expand as needed.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from typing import Any

from ..config import settings
from ..schemas import Health

router = APIRouter()

@router.get("/health", tags=["meta"])
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": settings.app_name, "version": "1.0.0-carnival"}

@router.get("/tasks", tags=["tasks"])
async def list_tasks() -> dict[str, Any]:
    # Stub — real implementation would query the DB via repo.
    # The full engine is available in app.agent.engine for future wiring.
    return {"items": [], "note": "carnival task engine present; full CRUD routers not yet restored"}

ROUTERS = [router]
