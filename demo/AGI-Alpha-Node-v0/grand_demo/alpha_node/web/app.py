"""FastAPI dashboard for AGI Alpha Node."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from ..compliance.scorecard import ComplianceEngine

logger = logging.getLogger(__name__)

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


def build_app() -> FastAPI:
    app = FastAPI(title="AGI Alpha Node Command Nexus")
    static_dir = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request) -> HTMLResponse:
        mermaid_diagram = """
        graph TD
            ENS[ENS Ownership Verified] --> Governance[Governance Multisig Control]
            Governance --> Pause[System Pause]
            Governance --> Stake[Stake Manager]
            Stake --> Rewards[Rewards + Fee Pool]
            Rewards --> Planner[MuZero++ Planner]
            Planner --> Orchestrator[Orchestrator]
            Orchestrator --> Specialists[Specialist Swarm]
            Specialists --> Knowledge[Knowledge Lake]
            Knowledge --> Planner
            Orchestrator --> Dashboard[Operator Dashboard]
        """
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "mermaid_diagram": mermaid_diagram,
            },
        )

    @app.get("/api/compliance", response_class=JSONResponse)
    async def compliance() -> JSONResponse:
        score = ComplianceEngine().build_score(
            ens_verified=True,
            stake_ok=True,
            paused=False,
            rewards_growth=0.85,
            drills_ok=True,
            planner_confidence=0.92,
        )
        return JSONResponse(score.as_dict())

    return app


app = build_app()
