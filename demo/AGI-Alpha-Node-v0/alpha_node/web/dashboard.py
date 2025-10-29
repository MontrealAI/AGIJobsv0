"""FastAPI dashboard for AGI Alpha Node."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from ..knowledge import KnowledgeLake

app = FastAPI(title="AGI Alpha Node Dashboard", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> HTMLResponse:
    html = Path(__file__).resolve().parent.parent.parent / "web" / "static" / "index.html"
    return FileResponse(html)


@app.get("/api/knowledge")
def latest_knowledge(limit: int = 10) -> JSONResponse:
    knowledge = KnowledgeLake(Path("./storage/knowledge.db"))
    entries = knowledge.latest(limit)
    payload = [
        {
            "topic": entry.topic,
            "content": entry.content,
            "tags": entry.tags,
            "confidence": entry.confidence,
            "created_at": entry.created_at.isoformat(),
        }
        for entry in entries
    ]
    return JSONResponse(payload)


@app.get("/api/system")
def system_status() -> Dict[str, str]:
    config_path = Path("config/alpha-node.yaml")
    if config_path.exists():
        return json.loads(config_path.read_text(encoding="utf-8"))
    return {"message": "demo configuration not yet initialized"}
