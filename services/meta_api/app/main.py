"""Production-ready FastAPI wrapper exposing the orchestrator routers."""

from __future__ import annotations

import logging
import os
from typing import Final

from fastapi import FastAPI

from routes.meta_orchestrator import router as meta_router
from routes.onebox import health_router, router as onebox_router

LOGGER: Final[logging.Logger] = logging.getLogger("agi.meta_api")


def _configure_logging() -> None:
    level = os.environ.get("META_API_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=getattr(logging, level, logging.INFO))
    LOGGER.info("Meta API logging configured", extra={"level": level})


def create_app() -> FastAPI:
    """Instantiate the FastAPI application with all orchestrator routers."""

    _configure_logging()
    app = FastAPI(title="AGI Jobs Meta API", version="0.1.0", docs_url="/docs")

    app.include_router(health_router)
    app.include_router(onebox_router)
    app.include_router(meta_router)

    @app.get("/healthz", tags=["health"])
    def root_health() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
