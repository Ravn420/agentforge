"""Provider abstraction.

A provider turns a list of OpenAI-style messages into a completion, optionally
emitting tool calls. The engine owns the tool loop; providers only translate.

Every provider records its own latency and token usage so the engine can persist
a ``ProviderCall`` row per invocation.
"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Sequence

from ..errors import ProviderNotConfiguredError, ProviderUnavailableError


@dataclass(slots=True)
class ToolCallRequest:
    """A tool invocation requested by the model."""

    id: str
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ProviderResponse:
    """Normalised completion returned by every provider."""

    content: str
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    raw: dict[str, Any] = field(default_factory=dict)


class LLMProvider(ABC):
    """Common interface for every model provider."""

    name: str = "abstract"

    @property
    @abstractmethod
    def configured(self) -> bool:
        """True when the credentials this provider needs are present."""

    @property
    def detail(self) -> str:
        return "configured" if self.configured else "missing credentials"

    def ensure_configured(self) -> None:
        if not self.configured:
            raise ProviderNotConfiguredError(
                f"Provider '{self.name}' has no credentials. "
                "Add them via the integrations menu, then retry."
            )

    @abstractmethod
    async def chat(
        self,
        *,
        messages: Sequence[dict[str, Any]],
        model: str | None = None,
        tools: Sequence[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        max_tokens: int | None = None,
    ) -> ProviderResponse:
        """Run one chat completion.

        ``model`` may be ``None``; providers fall back to their configured
        default, which is what lets a task omit ``model_id``.
        """


def _timed(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


__all__ = [
    "LLMProvider",
    "ProviderResponse",
    "ToolCallRequest",
    "ProviderNotConfiguredError",
    "ProviderUnavailableError",
    "_timed",
]
