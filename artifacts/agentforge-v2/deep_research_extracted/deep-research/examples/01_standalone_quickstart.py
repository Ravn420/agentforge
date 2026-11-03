#!/usr/bin/env python3
"""Standalone Quickstart for Deep Research.

Demonstrates running multi-round research on any topic using any OpenAI-compatible
LLM endpoint (Ollama, vLLM, OpenAI, DeepSeek, Groq, OpenRouter).
"""

import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path to import deep_research
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from deep_research import ResearchService

async def main():
    topic = "Key breakthroughs in quantum computing and error mitigation 2024-2026"
    print(f"=== Starting Deep Research on: {topic} ===\n")

    # Configure your LLM endpoint (defaults to local Ollama/vLLM or OpenAI)
    llm_endpoint = os.getenv("LLM_ENDPOINT", "http://localhost:11434/v1")
    llm_model = os.getenv("LLM_MODEL", "llama3.1")
    api_key = os.getenv("OPENAI_API_KEY", "")

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    def progress_callback(event):
        stage = event.get("stage", "info")
        msg = event.get("message", "")
        queries = event.get("queries")
        sources = event.get("sources")
        if queries:
            print(f"[{stage.upper()}] Generated Queries: {queries}")
        elif sources:
            print(f"[{stage.upper()}] Analyzed {len(sources)} sources")
        else:
            print(f"[{stage.upper()}] {msg}")

    service = ResearchService()
    result = await service.research(
        topic=topic,
        llm_endpoint=llm_endpoint,
        llm_model=llm_model,
        max_time=180,
        on_progress=progress_callback,
    )

    print("\n" + "=" * 60)
    print("FINAL RESEARCH REPORT:")
    print("=" * 60)
    print(result.summary)

    print("\n" + "=" * 60)
    print(f"SOURCES GATHERED ({len(result.sources)}):")
    print("=" * 60)
    for i, src in enumerate(result.sources, 1):
        print(f"{i}. [{src.title}]({src.url})")

if __name__ == "__main__":
    asyncio.run(main())
