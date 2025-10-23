"""Tests for the analytics FastAPI router."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from types import ModuleType

import pytest

try:  # pragma: no cover - guard if FastAPI unavailable
    from fastapi import APIRouter
    from fastapi.testclient import TestClient
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore
    TestClient = None  # type: ignore

os.environ.setdefault("RPC_URL", "http://localhost:8545")
os.environ.setdefault("ONEBOX_RELAYER_PRIVATE_KEY", "0x" + "1" * 64)
os.environ.setdefault("ONEBOX_API_TOKEN", "test-token")


def _inject_onebox_stub() -> None:
    if "routes.onebox" in sys.modules or APIRouter is None:
        return
    module = ModuleType("routes.onebox")
    module.health_router = APIRouter(prefix="/healthz")  # type: ignore[attr-defined]
    module.router = APIRouter(prefix="/onebox")  # type: ignore[attr-defined]

    def _require_api() -> None:
        return None

    module.require_api = _require_api  # type: ignore[attr-defined]
    sys.modules["routes.onebox"] = module


_inject_onebox_stub()

from services.meta_api.app.main import create_app


@pytest.mark.skipif(TestClient is None, reason="FastAPI application not available")
def test_refresh_and_latest(tmp_path, monkeypatch):
    app = create_app()
    with TestClient(app) as client:
        refresh = client.post("/analytics/refresh")
        assert refresh.status_code == 200
        payload = refresh.json()
        assert payload["reports"], "expected at least one report"
        latest = client.get("/analytics/latest")
        assert latest.status_code == 200
        snapshot = latest.json()
        assert snapshot["reports"], "cache should include reports"
        metrics = snapshot["reports"][0]
        assert "cms" in metrics and "spg" in metrics
        assert "artifactCount" in metrics["cms"]


@pytest.mark.skipif(TestClient is None, reason="FastAPI application not available")
def test_history_exports(tmp_path, monkeypatch):
    app = create_app()
    with TestClient(app) as client:
        response = client.post("/analytics/refresh")
        assert response.status_code == 200
        csv_response = client.get("/analytics/history.csv")
        assert csv_response.status_code == 200
        assert csv_response.headers["content-type"].startswith("text/csv")
        history_path = Path("storage/analytics/history.csv").resolve()
        assert history_path.exists()
        contents = history_path.read_text(encoding="utf-8")
        assert "artifact_count" in contents
        parquet_response = client.get("/analytics/history.parquet")
        assert parquet_response.status_code in {200, 404}
