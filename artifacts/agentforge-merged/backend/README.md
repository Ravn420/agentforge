# AgentForge Backend

FastAPI backend for the **AgentForge** React GUI — a provider-agnostic task
runner. Agents execute multi-step tasks against an LLM, using either
**OpenRouter** or **AWS Bedrock** as the provider, and persist every step,
message, deliverable, and provider call to SQLite.

## Data model

SQLite (no ORM — explicit SQL in `app/db.py`). The schema is derived from
`entities/*.jsonc`; those files are the source of truth for field names and
enums.

| Table               | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `users`             | Users (admin/user roles)                                       |
| `provider_settings` | Per-provider config (region, default model, active flag)       |
| `tasks`             | A task: goal, status, autonomy level, provider/model, budget   |
| `task_steps`        | Ordered steps belonging to a task                              |
| `chat_messages`     | User/agent/system messages for a task                          |
| `deliverables`      | Files/artifacts produced by a task                             |
| `provider_calls`    | Token usage and latency per LLM call                           |
| `task_attachments`  | Files attached to a task, with extracted text                  |

## Setup

Requires **Python 3.12**.

```bash
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt
```

Then create your environment file:

```bash
cp .env.example .env
```

Fill in at least `OPENROUTER_API_KEY` (the real key is normally entered through
the AgentForge integrations menu and stored in `provider_settings`; `.env` is
only for a server-wide default). See `.env.example` for every setting read by
`app/config.py`.

## Run

Windows:

```bash
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

macOS / Linux:

```bash
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

## API

All routes are served under the `/api/v1` prefix. Interactive docs are at
`/docs` (Swagger UI) and `/redoc`.

Resource groups:

- **health** — service liveness
- **users** — user records
- **tasks** — create/list/update tasks and run the agent loop
- **steps** — task steps
- **messages** — chat messages per task
- **deliverables** — produced artifacts
- **provider calls** — token/latency accounting
- **settings** — provider configuration
- **attachments** — task attachments
- **research** — research-oriented helpers

## Providers

**OpenRouter** is configured with `OPENROUTER_API_KEY` (plus
`OPENROUTER_DEFAULT_MODEL`, default `anthropic/claude-sonnet-4.5`). Calls use
`httpx.AsyncClient`.

**AWS Bedrock** is optional. `boto3` is imported lazily inside
`app/agent/providers/bedrock.py`, so the API runs fine without it. To enable
Bedrock, install the SDK and supply AWS credentials
(`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; the ambient AWS
credential chain also works):

```bash
./.venv/Scripts/python.exe -m pip install boto3
```

Bedrock uses `BEDROCK_DEFAULT_MODEL` (default `anthropic.claude-sonnet-4-5`).

## Testing

```bash
./.venv/Scripts/python.exe -m pytest
```

Configuration lives in `pytest.ini` (`testpaths = tests`,
`asyncio_mode = auto` — required by pytest-asyncio 1.x for async tests).

## Frontend

The Vite dev server must proxy API calls to the backend. Point `server.proxy`
in `vite.config.ts` at the backend:

```ts
server: {
  proxy: {
    '/api': 'http://127.0.0.1:8000',
  },
}
```

**Note:** this `vite.config.ts` edit is still pending — the proxy is not yet
configured in the frontend.
