"""FastAPI server exposing metrics and dashboards."""
from __future__ import annotations

import logging
from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import generate_latest

from .hub import MetricsHub

LOGGER = logging.getLogger(__name__)


def create_api(metrics: MetricsHub) -> FastAPI:
    app = FastAPI(title="AGI Alpha Node Metrics API", version="0.1.0")

    @app.get("/metrics")
    async def prometheus_metrics() -> PlainTextResponse:
        LOGGER.debug("Serving Prometheus metrics")
        return PlainTextResponse(generate_latest(metrics.registry), media_type="text/plain")

    @app.get("/metrics/summary")
    async def metrics_summary() -> JSONResponse:
        LOGGER.debug("Serving metrics summary")
        summary = metrics.summary()
        return JSONResponse({"metrics": [metric.__dict__ for metric in summary]})

    @app.get("/events")
    async def events() -> PlainTextResponse:
        LOGGER.debug("Serving event log")
        return PlainTextResponse(metrics.event_log.dump())

    return app
