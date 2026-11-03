# Carnival integration (single server)

The carnival agent/task model has been folded into the existing Node/Express
server. There is **one process**.

## What is integrated
- Task, step, message, and deliverable storage matching the carnival entities
  (`entities/*.jsonc`).
- Persistent JSON store at `data/carnival-tasks.json`.
- Endpoints under the same Express app that already serves research, media,
  claw/APK, etc.:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/tasks` | List (UI TaskItem shape + carnival fields) |
| GET | `/api/tasks/:id` | Task + steps + messages + deliverables |
| POST | `/api/tasks` | Create |
| DELETE | `/api/tasks/:id` | Delete |
| GET/POST | `/api/tasks/:id/steps` | Steps |
| GET/POST | `/api/tasks/:id/messages` | Chat messages |
| GET/POST | `/api/tasks/:id/deliverables` | Artifacts |
| GET | `/api/tasks/:id/status` | Status snapshot |
| POST | `/api/tasks/:id/plan` | Generate a simple step plan |

## Run
```bash
npm install
npm run dev
```
Everything (frontend + Node API + carnival task store) is on port 3000.

## Notes
- The original Python FastAPI tree remains under `backend/` as reference only.
  It is not started.
- The full LLM planner / tool-calling loop from `backend/app/agent/engine.py`
  can be ported later; the data model and REST surface are already in the
  single server.
