"""Typed errors shared across the AgentForge backend."""
from __future__ import annotations


class AgentForgeError(Exception):
    """Base class for every error the API raises on purpose."""

    status_code: int = 400
    code: str = "agentforge_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(AgentForgeError):
    status_code = 404
    code = "not_found"

    def __init__(self, resource: str, identifier: str | None = None) -> None:
        detail = f"{resource} '{identifier}' not found" if identifier else f"{resource} not found"
        super().__init__(detail)
        self.resource = resource
        self.identifier = identifier


class ValidationError(AgentForgeError):
    status_code = 422
    code = "validation_error"


class ProviderNotConfiguredError(AgentForgeError):
    """Raised when a task names a provider whose credentials are absent."""

    status_code = 503
    code = "provider_not_configured"


class ProviderUnavailableError(AgentForgeError):
    """Raised when a provider is configured but its SDK/runtime is missing."""

    status_code = 503
    code = "provider_unavailable"


class ProviderCallError(AgentForgeError):
    """Raised when the upstream provider returns a non-2xx response."""

    status_code = 502
    code = "provider_call_failed"


class TaskPausedError(AgentForgeError):
    """Raised when an operation needs a running task but it is paused."""

    status_code = 409
    code = "task_paused"


class SandboxViolationError(AgentForgeError):
    """Raised when a file tool escapes the configured workspace root."""

    status_code = 403
    code = "sandbox_violation"


class BlockedURLError(AgentForgeError):
    """Raised when a fetch targets a private/loopback address."""

    status_code = 403
    code = "blocked_url"
