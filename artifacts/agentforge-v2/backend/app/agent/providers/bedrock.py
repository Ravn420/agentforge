"""AWS Bedrock provider.

Bedrock is supported as an *optional* dependency: ``boto3`` is imported lazily
inside ``_client`` so the rest of the API runs fine when only OpenRouter is
configured. Without the SDK installed this raises ``ProviderUnavailableError``
rather than an import-time crash.
"""
from __future__ import annotations

import json
import time
from typing import Any, Sequence

from ...config import settings
from ...errors import ProviderCallError, ProviderUnavailableError
from .base import LLMProvider, ProviderResponse, ToolCallRequest, _timed


class BedrockProvider(LLMProvider):
    name = "bedrock"

    def __init__(
        self,
        region: str | None = None,
        default_model: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        session_token: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.region = region if region is not None else settings.aws_region
        self.default_model = (
            default_model if default_model is not None else settings.bedrock_default_model
        )
        self.access_key = access_key if access_key is not None else settings.aws_access_key_id
        self.secret_key = secret_key if secret_key is not None else settings.aws_secret_access_key
        self.session_token = session_token
        self.timeout = timeout if timeout is not None else settings.request_timeout_seconds
        self._runtime_client: Any = None

    @property
    def configured(self) -> bool:
        # Credentials may also come from the ambient AWS chain (~/.aws/credentials,
        # IAM role, env), so treat the SDK's own resolution as sufficient.
        return bool(self.access_key and self.secret_key) or self._ambient_credentials_present()

    def _ambient_credentials_present(self) -> bool:
        import os

        return bool(
            os.environ.get("AWS_ACCESS_KEY_ID")
            and os.environ.get("AWS_SECRET_ACCESS_KEY")
        ) or bool(os.environ.get("AWS_PROFILE") or os.environ.get("AWS_DEFAULT_PROFILE"))

    def _client(self) -> Any:
        if self._runtime_client is not None:
            return self._runtime_client
        try:
            import boto3  # type: ignore[import-not-found]
        except ImportError as exc:
            raise ProviderUnavailableError(
                "AWS Bedrock support requires boto3. Install it with: "
                "pip install boto3  (then restart the server)"
            ) from exc

        kwargs: dict[str, Any] = {"region_name": self.region, "service_name": "bedrock-runtime"}
        if self.access_key and self.secret_key:
            kwargs["aws_access_key_id"] = self.access_key
            kwargs["aws_secret_access_key"] = self.secret_key
            if self.session_token:
                kwargs["aws_session_token"] = self.session_token
        self._runtime_client = boto3.client(**kwargs)
        return self._runtime_client

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
        client = self._client()
        model_id = model or self.default_model

        body: dict[str, Any] = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": _to_anthropic_messages(messages),
            "max_tokens": max_tokens or 4096,
        }
        if tools:
            body["tools"] = _to_anthropic_tools(tools)

        start = time.perf_counter()
        try:
            # boto3 is synchronous; run it off the event loop.
            import asyncio

            response = await asyncio.to_thread(
                client.converse,
                modelId=model_id,
                messages=body["messages"],
                maxTokens=body["max_tokens"],
                **({"toolConfig": body["tools"]} if tools else {}),
            )
        except Exception as exc:  # noqa: BLE001 - surface the provider's own message
            raise ProviderCallError(f"Bedrock converse failed: {exc}") from exc

        latency = _timed(start)
        usage = response.get("usage") or {}
        text = _extract_text(response)
        tool_calls = _extract_tool_uses(response)

        return ProviderResponse(
            content=text,
            tool_calls=tool_calls,
            input_tokens=int(usage.get("inputTokens") or 0),
            output_tokens=int(usage.get("outputTokens") or 0),
            latency_ms=latency,
            raw={"modelId": model_id},
        )


def _to_anthropic_messages(messages: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert OpenAI-style messages to Anthropic's content-block shape."""
    converted: list[dict[str, Any]] = []
    for message in messages:
        role = message.get("role")
        if role == "system":
            # Anthropic takes system text separately; keep it as a leading user turn.
            converted.append({"role": "user", "content": [{"type": "text", "text": message.get("content", "")}]})
            continue
        if role == "tool":
            converted.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": message.get("tool_call_id", ""),
                            "content": message.get("content", ""),
                        }
                    ],
                }
            )
            continue
        converted.append(
            {"role": "assistant" if role == "assistant" else "user",
             "content": [{"type": "text", "text": message.get("content") or ""}]}
        )
    return converted


def _to_anthropic_tools(tools: Sequence[dict[str, Any]]) -> dict[str, Any]:
    return {
        "tools": [
            {
                "toolSpec": {
                    "name": tool["function"]["name"],
                    "description": tool["function"].get("description", ""),
                    "inputSchema": {"json": tool["function"].get("parameters", {"type": "object"})},
                }
            }
            for tool in tools
        ]
    }


def _extract_text(response: dict[str, Any]) -> str:
    blocks = (response.get("output") or {}).get("message", {}).get("content") or []
    return "".join(block.get("text", "") for block in blocks if block.get("type") == "text")


def _extract_tool_uses(response: dict[str, Any]) -> list[ToolCallRequest]:
    blocks = (response.get("output") or {}).get("message", {}).get("content") or []
    calls: list[ToolCallRequest] = []
    for block in blocks:
        if block.get("type") != "tool_use":
            continue
        raw = block.get("input")
        arguments = raw if isinstance(raw, dict) else {}
        calls.append(
            ToolCallRequest(id=block.get("id", ""), name=block.get("name", ""), arguments=arguments)
        )
    return calls


__all__ = ["BedrockProvider", "json"]
