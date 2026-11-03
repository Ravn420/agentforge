"""OpenRouter provider.

OpenRouter exposes an OpenAI-compatible ``/chat/completions`` endpoint and
normalises 500+ models behind one key, so no per-vendor SDK is required.
"""
from __future__ import annotations

import time
from typing import Any, Sequence

import httpx

from ...config import settings
from ...errors import ProviderCallError
from .base import LLMProvider, ProviderResponse, ToolCallRequest, _timed

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterProvider(LLMProvider):
    name = "openrouter"

    def __init__(
        self,
        api_key: str | None = None,
        default_model: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else settings.openrouter_api_key
        self.default_model = (
            default_model if default_model is not None else settings.openrouter_default_model
        )
        self.timeout = timeout if timeout is not None else settings.request_timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def chat(
        self,
        *,
        messages: Sequence[dict[str, Any]],
        model: str | None = None,
        tools: Sequence[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        max_tokens: int | None = None,
    ) -> ProviderResponse:
        self.ensure_configured()
        payload: dict[str, Any] = {
            "model": model or self.default_model,
            "messages": list(messages),
        }
        if tools:
            payload["tools"] = list(tools)
            payload["tool_choice"] = tool_choice or "auto"
        if max_tokens:
            payload["max_tokens"] = max_tokens

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "AgentForge",
        }

        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(ENDPOINT, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            raise ProviderCallError(f"OpenRouter request failed: {exc}") from exc

        latency = _timed(start)
        if response.status_code != 200:
            raise ProviderCallError(
                f"OpenRouter returned {response.status_code}: {response.text[:500]}"
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise ProviderCallError("OpenRouter returned a non-JSON body") from exc

        try:
            message = data["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderCallError(f"Unexpected OpenRouter payload: {data!r}") from exc

        usage = data.get("usage") or {}
        tool_calls = [
            ToolCallRequest(
                id=call.get("id") or f"call_{index}",
                name=call["function"]["name"],
                arguments=_parse_arguments(call["function"].get("arguments")),
            )
            for index, call in enumerate(message.get("tool_calls") or [])
        ]

        return ProviderResponse(
            content=message.get("content") or "",
            tool_calls=tool_calls,
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            latency_ms=latency,
            raw=data,
        )


def _parse_arguments(raw: Any) -> dict[str, Any]:
    """Tool arguments arrive as a JSON string; tolerate already-parsed dicts."""
    import json

    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {"_raw": str(raw)}
    return parsed if isinstance(parsed, dict) else {"_raw": parsed}


__all__ = ["OpenRouterProvider", "ENDPOINT"]
