# Deep Research Engine

An autonomous, multi-round deep web research engine designed for LLM applications, agents, and microservices.

Inspired by Alibaba's **IterResearch** framework, this engine implements an iterative **Think → Search → Extract → Synthesize** loop where the language model drives every strategic decision:
1. **Planning**: Decomposes complex queries into focused sub-questions and key investigative angles.
2. **Multi-Round Search**: Queries live web providers (DuckDuckGo, Brave, SearXNG, Tavily, Google PSE, or Serper).
3. **Goal-Based Extraction**: Navigates web pages, strips boilerplate and ads, and extracts dense factual evidence mapped to the research goals.
4. **Autonomous Stopping Condition**: Decides when sufficient depth has been reached or generates gap-filling search queries.
5. **Synthesis & Visual Reports**: Produces comprehensive markdown reports with verified citations and self-contained, editorial HTML visual reports.

---

## 📦 What's in this Package

```
deep_research/
├── deep_research/           # Core Python package
│   ├── engine.py            # DeepResearcher multi-round research loop
│   ├── handler.py           # Background task runner & job registry
│   ├── service.py           # Clean async ResearchService interface
│   ├── navigator.py         # Multi-step web page navigation & action parser
│   ├── visual_report.py     # Standalone editorial HTML report builder
│   ├── utils.py             # Reasoning tag stripping & quality filters
│   ├── extractor.py         # Goal-oriented web extraction prompts
│   ├── security.py          # Prompt injection defenses & context sandboxing
│   ├── search/              # Multi-provider web search subsystem
│   │   ├── core.py          # Unified search orchestrator
│   │   ├── providers.py     # DDG, Brave, SearXNG, Tavily, Google adapters
│   │   ├── content.py       # Webpage reader & HTML-to-text scraper
│   │   ├── ranking.py       # Relevance reranking & deduplication
│   │   ├── cache.py         # Cache management
│   │   └── query.py         # Query reformulation & planning
│   ├── api/                 # FastAPI REST and SSE streaming router
│   │   └── routes.py        # /start, /stream/{id}, /result/{id}, /report/{id}
│   └── tools/               # Agent tool bindings
│       └── agent_tools.py   # Function-calling tool implementations
├── frontend/                # Ready-to-use web UI components
│   ├── js/                  # panel.js, jobs.js, researchSynapse.js
│   └── css/                 # 17-research.css (dark/light themes, cards)
├── cli/                     # Command-line interface
│   └── odysseus-research    # Shell wrapper to inspect & export reports
├── examples/                # Plug-and-play runnable examples
│   ├── 01_standalone_quickstart.py
│   ├── 02_fastapi_server.py
│   └── 03_web_demo.html
├── specs/                   # Technical architectural specification
│   └── research.md
├── requirements.txt         # Dependencies
├── LICENSE                  # Apache 2.0 License
└── README.md
```

---

## 🚀 Quickstart in 2 Minutes

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run Standalone Research (Python)

```python
import asyncio
from deep_research import ResearchService

async def main():
    service = ResearchService()
    
    result = await service.research(
        topic="Recent breakthroughs in room-temperature superconductors",
        llm_endpoint="https://api.openai.com/v1",  # Or Ollama: http://localhost:11434/v1
        llm_model="gpt-4o",                        # Or llama3.1, deepseek-r1, etc.
        on_progress=lambda e: print(f"[{e.get('stage')}] {e.get('message')}")
    )

    print("\n=== SUMMARY ===")
    print(result.summary)
    
    print("\n=== SOURCES ===")
    for src in result.sources:
        print(f"- {src.title}: {src.url}")

if __name__ == "__main__":
    asyncio.run(main())
```

Or run the bundled example directly:
```bash
python examples/01_standalone_quickstart.py
```

---

## 🌐 Running as a FastAPI Microservice

To run as an independent microservice that any project or frontend can call over HTTP:

```bash
uvicorn examples.02_fastapi_server:app --port 8000 --reload
```

Open `http://localhost:8000/docs` to see Swagger docs.

### API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/research/start` | Launch asynchronous research task |
| `GET` | `/api/research/stream/{id}` | Real-time SSE stream of progress events |
| `GET` | `/api/research/result/{id}` | Retrieve final markdown report & sources |
| `GET` | `/api/research/report/{id}` | View interactive, styled HTML visual report |
| `POST` | `/api/research/cancel/{id}` | Cancel an ongoing research task |
| `GET` | `/api/research/library` | List historical research reports |

---

## 🔍 Search Provider Configuration

The engine supports multiple search backends out of the box:
- **DuckDuckGo**: Works immediately with **no API keys required**.
- **Brave Search**: Set `BRAVE_API_KEY`.
- **SearXNG**: Set `SEARXNG_URL` (e.g. `http://localhost:8080`).
- **Tavily**: Set `TAVILY_API_KEY`.
- **Google Custom Search (PSE)**: Set `GOOGLE_PSE_API_KEY` & `GOOGLE_PSE_ENGINE_ID`.
- **Serper**: Set `SERPER_API_KEY`.

---

## 🤖 Integrating with Agent Frameworks

You can bind Deep Research as a tool for LangChain, CrewAI, AutoGen, or OpenAI Assistants:

```python
from deep_research.tools import do_manage_research

# Provide as a callable function to your agent
agent_tools = [
    {
        "type": "function",
        "function": {
            "name": "deep_research",
            "description": "Perform multi-round deep web research on any complex topic.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The research question or topic"}
                },
                "required": ["query"]
            }
        }
    }
]
```

---

## 🎨 Visual Report Generation

Deep Research includes an editorial-grade HTML report generator (`visual_report.py`):
```python
from deep_research import build_visual_report

html_content = build_visual_report(
    markdown_report=result.summary,
    sources=result.sources,
    title="Superconductor Discoveries 2026",
    theme="dark"  # 'dark', 'light', or 'system'
)

with open("report.html", "w") as f:
    f.write(html_content)
```

The output report includes:
- Animated hero gradient with auto-extracted title & topic
- Dynamic Table of Contents auto-generated from markdown headings
- Interactive collapsible source pills and OpenGraph thumbnails
- Local typography, responsive design, and printer-friendly layout
- Allowlist sanitization protecting against XSS

---

## 📄 License

Licensed under the **Apache License, Version 2.0**. See `LICENSE` for details.
