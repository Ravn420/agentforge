"""AgentForge API entry point.

Run with::

    .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000

Interactive docs are served at ``/docs`` and ``/redoc``.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import close_db, connect, init_db
from .errors import AgentForgeError
from .routers import ROUTERS
from .schemas import ErrorBody, Health
from .agent.providers import provider_health

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("agentforge")

VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open the database for the lifetime of the process."""
    conn = await connect()
    await init_db(conn)
    app.state.db = conn
    log.info("database ready at %s", settings.database_path)
    log.info(
        "providers: %s",
        ", ".join(
            f"{item.provider.value}={'ok' if item.configured else 'not configured'}"
            for item in provider_health()
        ),
    )
    try:
        yield
    finally:
        await close_db(conn)
        log.info("database closed")


app = FastAPI(
    title=settings.app_name,
    version=VERSION,
    description=(
        "Provider-agnostic backend for the AgentForge GUI. Runs autonomous tasks "
        "against OpenRouter or AWS Bedrock, records every model call, and exposes "
        "plans, steps, messages, deliverables, and cost."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AgentForgeError)
async def agentforge_error_handler(request: Request, exc: AgentForgeError) -> JSONResponse:
    """Map every typed domain error to a consistent JSON envelope."""
    log.info("%s %s -> %s %s", request.method, request.url.path, exc.status_code, exc.code)
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorBody(code=exc.code, message=exc.message).model_dump(),
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last-resort handler: log loudly, leak nothing to the client."""
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content=ErrorBody(code="internal_error", message="Unexpected server error.").model_dump(),
    )


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": VERSION,
        "docs": "/docs",
        "api": settings.api_prefix,
    }


# Routers are registered after the error handlers so their routes are covered.
for router in ROUTERS:
    app.include_router(router, prefix=settings.api_prefix)


__all__ = ["app", "lifespan", "VERSION", "aiosqlite", "Health"]
