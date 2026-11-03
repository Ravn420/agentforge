"""Pydantic DTOs for the AgentForge HTTP API.

Field names mirror ``entities/*.jsonc``. Enum values are declared here once and
reused for both validation and OpenAPI documentation.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# --------------------------------------------------------------------------
# Enums — single source of truth for the API surface
# --------------------------------------------------------------------------


class Provider(str, Enum):
    bedrock = "bedrock"
    openrouter = "openrouter"


class TaskStatus(str, Enum):
    queued = "queued"
    running = "running"
    paused = "paused"
    completed = "completed"
    failed = "failed"


class AutonomyLevel(str, Enum):
    full_auto = "full_auto"
    confirm_each_step = "confirm_each_step"
    manual = "manual"


class StepStatus(str, Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"
    skipped = "skipped"


class MessageRole(str, Enum):
    user = "user"
    agent = "agent"
    system = "system"


class FileType(str, Enum):
    text = "text"
    markdown = "markdown"
    code = "code"
    csv = "csv"
    json = "json"


class CallStatus(str, Enum):
    success = "success"
    error = "error"


class UserRole(str, Enum):
    admin = "admin"
    user = "user"


# --------------------------------------------------------------------------
# Shared mixins
# --------------------------------------------------------------------------


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


# --------------------------------------------------------------------------
# Users
# --------------------------------------------------------------------------


class UserCreate(BaseModel):
    role: UserRole = UserRole.user
    email: str | None = None
    name: str | None = None
    avatar_url: str | None = None


class UserUpdate(BaseModel):
    role: UserRole | None = None
    email: str | None = None
    name: str | None = None
    avatar_url: str | None = None


class UserOut(ORMModel):
    id: str
    role: UserRole
    email: str | None = None
    name: str | None = None
    avatar_url: str | None = None
    created_at: str


# --------------------------------------------------------------------------
# Provider settings
# --------------------------------------------------------------------------


class ProviderSettingsIn(BaseModel):
    provider: Provider
    aws_region: str = "us-east-1"
    openrouter_default_model: str = "anthropic/claude-sonnet-4.5"
    bedrock_default_model: str = "anthropic.claude-sonnet-4-5"
    is_active: bool = True


class ProviderSettingsUpdate(BaseModel):
    aws_region: str | None = None
    openrouter_default_model: str | None = None
    bedrock_default_model: str | None = None
    is_active: bool | None = None


class ProviderSettingsOut(ORMModel):
    id: str
    provider: Provider
    aws_region: str
    openrouter_default_model: str
    bedrock_default_model: str
    is_active: bool
    created_by_id: str | None = None
    updated_at: str


class ProviderHealth(BaseModel):
    provider: Provider
    configured: bool
    active: bool
    default_model: str
    detail: str


# --------------------------------------------------------------------------
# Tasks
# --------------------------------------------------------------------------


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    goal: str = Field(..., min_length=1, max_length=5000)
    autonomy_level: AutonomyLevel = AutonomyLevel.full_auto
    max_steps: int = Field(10, ge=1, le=200)
    provider: Provider = Provider.openrouter
    model_id: str | None = None
    time_budget_minutes: int = Field(30, ge=1, le=24 * 60)


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    goal: str | None = Field(None, min_length=1, max_length=5000)
    status: TaskStatus | None = None
    autonomy_level: AutonomyLevel | None = None
    max_steps: int | None = Field(None, ge=1, le=200)
    provider: Provider | None = None
    model_id: str | None = None
    time_budget_minutes: int | None = Field(None, ge=1, le=24 * 60)
    final_summary: str | None = None
    error_message: str | None = None


class TaskOut(ORMModel):
    id: str
    title: str
    goal: str
    status: TaskStatus
    autonomy_level: AutonomyLevel
    max_steps: int
    provider: Provider
    model_id: str | None = None
    final_summary: str | None = None
    error_message: str | None = None
    time_budget_minutes: int
    created_by_id: str | None = None
    created_at: str
    updated_at: str


class TaskListResponse(BaseModel):
    tasks: list[TaskOut]
    total: int


class PlanStepDraft(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str = Field("", max_length=2000)


class PlanRequest(BaseModel):
    steps: list[PlanStepDraft]


# --------------------------------------------------------------------------
# Steps
# --------------------------------------------------------------------------


class StepOut(ORMModel):
    id: str
    task_id: str
    order_index: int
    title: str
    description: str | None = None
    status: StepStatus
    output: str | None = None
    retry_count: int
    started_at: str | None = None
    completed_at: str | None = None


class StepUpdate(BaseModel):
    status: StepStatus | None = None
    output: str | None = None
    title: str | None = Field(None, min_length=1, max_length=300)


# --------------------------------------------------------------------------
# Chat messages
# --------------------------------------------------------------------------


class MessageCreate(BaseModel):
    role: MessageRole = MessageRole.user
    content: str = Field(..., min_length=1, max_length=50_000)


class MessageOut(ORMModel):
    id: str
    task_id: str
    role: MessageRole
    content: str
    created_by_id: str | None = None
    created_at: str


# --------------------------------------------------------------------------
# Deliverables
# --------------------------------------------------------------------------


class DeliverableCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    file_type: FileType = FileType.text
    content: str | None = None
    storage_url: str | None = None


class DeliverableUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=300)
    file_type: FileType | None = None
    content: str | None = None
    storage_url: str | None = None


class DeliverableOut(ORMModel):
    id: str
    task_id: str
    name: str
    file_type: FileType
    content: str | None = None
    storage_url: str | None = None
    size_bytes: int
    created_by_id: str | None = None
    created_at: str


# --------------------------------------------------------------------------
# Provider calls
# --------------------------------------------------------------------------


class ProviderCallOut(ORMModel):
    id: str
    task_id: str
    provider: Provider
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    status: CallStatus
    error: str | None = None
    created_at: str


class CostSummary(BaseModel):
    task_id: str | None = None
    calls: int
    input_tokens: int
    output_tokens: int
    latency_ms: int
    errors: int


# --------------------------------------------------------------------------
# Attachments
# --------------------------------------------------------------------------


class AttachmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    file_url: str | None = None
    extracted_text: str | None = None
    size_bytes: int = Field(0, ge=0)


class AttachmentOut(ORMModel):
    id: str
    task_id: str
    name: str
    extracted_text: str | None = None
    file_url: str | None = None
    size_bytes: int
    created_at: str


# --------------------------------------------------------------------------
# Agent / tools
# --------------------------------------------------------------------------


class ToolCall(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    name: str
    ok: bool
    result: str
    detail: str | None = None


class AgentEvent(BaseModel):
    """One line of the activity feed the UI renders."""

    type: Literal["info", "tool", "error", "step", "done"]
    message: str
    at: datetime = Field(default_factory=datetime.utcnow)


class AgentStatus(BaseModel):
    task_id: str
    status: TaskStatus
    plan: list[PlanStepDraft] = Field(default_factory=list)
    steps: list[StepOut] = Field(default_factory=list)
    deliverables: list[DeliverableOut] = Field(default_factory=list)
    events: list[AgentEvent] = Field(default_factory=list)
    cost: CostSummary | None = None


# --------------------------------------------------------------------------
# Research (deep-research pipeline)
# --------------------------------------------------------------------------


class ResearchRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=2000)
    model: str | None = None
    runs: int = Field(3, ge=1, le=5)
    search_provider: str = "duckduckgo"


class ResearchSource(BaseModel):
    title: str
    url: str
    snippet: str = ""


class ResearchResult(BaseModel):
    query: str
    model: str
    runs: int
    sources: list[ResearchSource] = Field(default_factory=list)
    report: str
    deliverable_id: str | None = None
    calls: int
    input_tokens: int
    output_tokens: int


# --------------------------------------------------------------------------
# Misc
# --------------------------------------------------------------------------


class Health(BaseModel):
    status: str
    version: str
    providers: list[ProviderHealth] = Field(default_factory=list)


class ErrorBody(BaseModel):
    code: str
    message: str


class TaskNotFoundValidator(TaskOut):
    """Marker for docs; not used at runtime."""


def validate_provider(value: str) -> Provider:
    """Standalone validator reused by endpoints taking a raw provider string."""
    try:
        return Provider(value)
    except ValueError as exc:
        raise ValueError(f"unknown provider: {value!r}") from exc


# Kept for OpenAPI friendliness on enum fields.
ProviderField = Literal["bedrock", "openrouter"]
