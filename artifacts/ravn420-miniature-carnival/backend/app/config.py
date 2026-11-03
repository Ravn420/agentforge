"""Runtime configuration for the AgentForge backend.

Secrets live in the environment (``backend/.env``). Settings live in code.
Never put a credential in this file — see ``.env.example``.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

# Secrets: backend/.env first, then project root. First occurrence wins.
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BACKEND_DIR / ".env"), extra="ignore")

    app_name: str = "AgentForge API"
    api_prefix: str = "/api/v1"
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    database_path: str = str(BACKEND_DIR / "data" / "agentforge.db")

    # --- Provider credentials (user-supplied, never entered by an agent) ---
    openrouter_api_key: str = ""
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # --- Provider defaults (mirrors entities/ProviderSettings.jsonc) ---
    openrouter_default_model: str = "anthropic/claude-sonnet-4.5"
    bedrock_default_model: str = "anthropic.claude-sonnet-4-5"

    # --- Tool sandbox ---
    # File/URL tools may only touch paths inside this root.
    workspace_root: str = str(PROJECT_ROOT)

    # --- Agent loop ---
    max_agent_iterations: int = 8
    request_timeout_seconds: float = 120.0
    max_url_response_bytes: int = 200_000

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def database_dir(self) -> Path:
        return Path(self.database_path).parent


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
