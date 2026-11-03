"""Free-lane models. The requested model is never swapped.

A 429 rotates the egress identity, not the model. This list is the anonymous
free lane; anything with usesCredits is rejected by the server.
"""
from __future__ import annotations

# Known free anonymous text models. The agents endpoint serves these without
# an API key. Paid / credit models are absent on purpose.
FREE_MODELS = (
    "deepseek-v4-1-flash-free",
    "deepseek-v4-1-flash",
    "deepseek-v4-flash",
    "deepseek-v4-flash-0731",
    "venice-uncensored-1-2",
    "llama-3.3-70b",
    "llama-3.2-3b",
    "qwen-2.5-coder-32b",
    "mistral-31-24b",
)


def free_models() -> tuple[str, ...]:
    return FREE_MODELS


def is_free(model: str) -> bool:
    if not model:
        return False
    if model in FREE_MODELS:
        return True
    # accept the free-lane suffix and any id the anonymous endpoint already serves
    return model.endswith("-free") or model.startswith("venice-")
