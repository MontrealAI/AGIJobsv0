"""Production-ready FastAPI wrapper exposing the orchestrator routers."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Final, AsyncIterator

from fastapi import FastAPI

from orchestrator.analytics import AnalyticsScheduler, AnalyticsEngine, get_cache, run_once
from routes.analytics import router as analytics_router
from routes.hgm import router as hgm_router
from routes.agents import router as agents_router
from routes.meta_orchestrator import router as meta_router
from routes.onebox import health_router, router as onebox_router

LOGGER: Final[logging.Logger] = logging.getLogger("agi.meta_api")


def _configure_logging() -> None:
    level = os.environ.get("META_API_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=getattr(logging, level, logging.INFO))
    LOGGER.info("Meta API logging configured", extra={"level": level})


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    scheduler = AnalyticsScheduler(AnalyticsEngine(), get_cache())
    scheduler.start()
    if not get_cache().snapshot().get("reports"):
        try:
            run_once()
        except Exception:  # pragma: no cover - best-effort warm cache
            LOGGER.warning("analytics warmup failed", exc_info=True)
    try:
        yield
    finally:
        scheduler.stop()


def create_app() -> FastAPI:
    """Instantiate the FastAPI application with all orchestrator routers."""

    _configure_logging()
    app = FastAPI(title="AGI Jobs Meta API", version="0.1.0", docs_url="/docs", lifespan=_lifespan)

    app.include_router(health_router)
    app.include_router(onebox_router)
    app.include_router(meta_router)
    app.include_router(analytics_router)
    app.include_router(agents_router)
    app.include_router(hgm_router)

    @app.get("/healthz", tags=["health"])
    def root_health() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
