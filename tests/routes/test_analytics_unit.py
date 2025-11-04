from pathlib import Path

import pytest
from fastapi import HTTPException

import routes.analytics as analytics_module
from orchestrator.analytics import AnalyticsError


def test_get_latest_refresh_error(monkeypatch):
    def boom():
        raise AnalyticsError("boom")

    monkeypatch.setattr(analytics_module, "run_once", boom)
    with pytest.raises(HTTPException) as excinfo:
        analytics_module.get_latest(refresh=True)
    assert excinfo.value.status_code == 503
    detail = excinfo.value.detail
    assert detail["code"] == "ANALYTICS_UNAVAILABLE"
    assert "boom" in detail["message"]


def test_history_resolver(monkeypatch, tmp_path):
    output = tmp_path / "history.csv"
    monkeypatch.setattr(analytics_module, "_OUTPUT_DIR", tmp_path)

    with pytest.raises(HTTPException) as excinfo:
        analytics_module.history_csv()
    assert excinfo.value.status_code == 404

    output.write_text("timestamp,artifact_count\n", encoding="utf-8")
    response = analytics_module.history_csv()
    assert Path(response.path) == output
    assert response.media_type == "text/csv"
