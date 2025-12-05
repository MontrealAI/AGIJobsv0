"""Tests for the analytics FastAPI router."""

from __future__ import annotations

import importlib
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

_API_TOKEN = os.environ["ONEBOX_API_TOKEN"]
_AUTH_HEADERS = {"Authorization": f"Bearer {_API_TOKEN}"}


def _inject_onebox_stub() -> None:
    """Provide a lightweight routes.onebox stub only when the real module is unavailable.

    The analytics tests do not exercise the OneBox router, but the FastAPI application
    imports it during startup. Previously we unconditionally injected a stub, which
    polluted ``sys.modules`` and broke downstream tests that rely on the real
    implementation (they could no longer import ``ExecuteRequest`` or
    ``OrgPolicyStore``). To keep test isolation without hiding the production module,
    we now try to import the real package first and fall back to a stub only if FastAPI
    itself is missing.
    """

    if "routes.onebox" in sys.modules:
        return

    if APIRouter is not None:
        try:
            importlib.import_module("routes.onebox")
            return
        except Exception:
            # If the real module cannot load (e.g., FastAPI is unavailable), fall back
            # to a minimal stub so analytics tests can still bootstrap the app.
            pass

    if APIRouter is None:
        return

    module = ModuleType("routes.onebox")
    module.health_router = APIRouter(prefix="/healthz")  # type: ignore[attr-defined]
    module.router = APIRouter(prefix="/onebox")  # type: ignore[attr-defined]

    def _require_api() -> None:
        return None

    module.require_api = _require_api  # type: ignore[attr-defined]
    sys.modules["routes.onebox"] = module


_inject_onebox_stub()

import routes.analytics as analytics_module
from orchestrator.analytics import AnalyticsError
from services.meta_api.app.main import create_app


@pytest.mark.skipif(TestClient is None, reason="FastAPI application not available")
def test_refresh_and_latest(tmp_path, monkeypatch):
    app = create_app()
    with TestClient(app) as client:
        refresh = client.post("/analytics/refresh", headers=_AUTH_HEADERS)
        assert refresh.status_code == 200
        payload = refresh.json()
        assert payload["reports"], "expected at least one report"
        latest = client.get("/analytics/latest", headers=_AUTH_HEADERS)
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
        response = client.post("/analytics/refresh", headers=_AUTH_HEADERS)
        assert response.status_code == 200
        csv_response = client.get("/analytics/history.csv", headers=_AUTH_HEADERS)
        assert csv_response.status_code == 200
        assert csv_response.headers["content-type"].startswith("text/csv")
        history_path = Path("storage/analytics/history.csv").resolve()
        assert history_path.exists()
        contents = history_path.read_text(encoding="utf-8")
        assert "artifact_count" in contents
        parquet_response = client.get("/analytics/history.parquet", headers=_AUTH_HEADERS)
        assert parquet_response.status_code in {200, 404}


@pytest.mark.skipif(TestClient is None, reason="FastAPI application not available")
def test_history_missing_and_refresh_error(monkeypatch, tmp_path):
    app = create_app()

    def boom():
        raise AnalyticsError("boom")

    monkeypatch.setattr(analytics_module, "run_once", boom)
    analytics_module._OUTPUT_DIR = tmp_path

    with TestClient(app) as client:
        refresh = client.post("/analytics/refresh", headers=_AUTH_HEADERS)
        assert refresh.status_code == 503
        assert refresh.json()["detail"]["code"] == "ANALYTICS_UNAVAILABLE"

        csv_path = tmp_path / "history.csv"
        if csv_path.exists():
            csv_path.unlink()
        history = client.get("/analytics/history.csv", headers=_AUTH_HEADERS)
        assert history.status_code == 404
