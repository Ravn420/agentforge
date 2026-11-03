"""Provider factory.

Builds the right :class:`LLMProvider` for a task's ``provider`` field and
reports which providers are actually usable right now.

The factory is deliberately DB-free: which providers are *active* is a stored
preference, so callers pass it in as ``active_map``.
"""
from __future__ import annotations

from functools import lru_cache

from ...config import settings
from ...errors import NotFoundError
from ...schemas import Provider, ProviderHealth
from .base import LLMProvider
from .bedrock import BedrockProvider
from .openrouter import OpenRouterProvider

_PROVIDERS: dict[Provider, type[LLMProvider]] = {
    Provider.openrouter: OpenRouterProvider,
    Provider.bedrock: BedrockProvider,
}


@lru_cache(maxsize=None)
def _instance(provider: Provider) -> LLMProvider:
    """Cached per-provider instance — providers hold no per-request state.

    Built once from settings at first use, so credential changes need a server
    restart. That is intentional: it keeps a request from observing a
    half-rotated key.
    """
    return _PROVIDERS[provider]()


def get_provider(provider: Provider | str) -> LLMProvider:
    """Resolve a provider name to a provider instance."""
    try:
        key = Provider(provider)
    except ValueError as exc:
        raise NotFoundError("Provider", str(provider)) from exc
    return _instance(key)


def is_configured(provider: Provider | str) -> bool:
    return bool(get_provider(provider).configured)  # type: ignore[attr-defined]


def available_providers() -> list[Provider]:
    return [key for key in Provider if is_configured(key)]


def provider_health(active_map: dict[str, bool] | None = None) -> list[ProviderHealth]:
    """Report configuration state for every supported provider.

    ``active_map`` maps ``provider -> is_active`` from ``provider_settings``.
    Missing entries are treated as active, matching the schema default.
    """
    active_map = active_map or {}
    health: list[ProviderHealth] = []

    for key in Provider:
        instance = _instance(key)
        if key is Provider.openrouter:
            model = instance.default_model  # type: ignore[attr-defined]
        else:
            model = settings.bedrock_default_model

        if key is Provider.openrouter:
            detail = instance.detail  # type: ignore[attr-defined]
        elif not instance.configured:  # type: ignore[attr-defined]
            detail = "boto3 not installed and no AWS credentials"
        else:
            detail = "configured"

        health.append(
            ProviderHealth(
                provider=key,
                configured=bool(instance.configured),  # type: ignore[attr-defined]
                active=bool(active_map.get(key.value, True)),
                default_model=model,
                detail=detail,
            )
        )
    return health


__all__ = [
    "get_provider",
    "is_configured",
    "available_providers",
    "provider_health",
]
