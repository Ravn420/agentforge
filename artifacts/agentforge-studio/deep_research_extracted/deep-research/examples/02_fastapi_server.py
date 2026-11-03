#!/usr/bin/env python3
"""Ready-to-run FastAPI Microservice Server for Deep Research.

Provides:
- POST /api/research/start       (Start asynchronous research job)
- GET  /api/research/stream/{id} (Real-time SSE event stream)
- GET  /api/research/result/{id} (Get final report JSON)
- GET  /api/research/report/{id} (View interactive HTML visual report)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from deep_research.api import router as research_router

app = FastAPI(
    title="Deep Research API",
    description="Autonomous IterResearch Engine with multi-round search, extraction, and synthesis",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(research_router)

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Deep Research Engine",
        "docs_url": "/docs",
        "endpoints": {
            "start": "POST /api/research/start",
            "stream": "GET /api/research/stream/{session_id}",
            "result": "GET /api/research/result/{session_id}",
            "report_html": "GET /api/research/report/{session_id}",
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("02_fastapi_server:app", host="0.0.0.0", port=8000, reload=True)
