from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest


def test_meta_agentic_alpha_v5_demo(tmp_path: Path) -> None:
    source_dir = Path(__file__).resolve().parents[1]
    working_copy = tmp_path / "Meta-Agentic-ALPHA-AGI-Jobs-v0"
    shutil.copytree(source_dir, working_copy)

    python_path = working_copy / "python"
    import sys

    sys.path.insert(0, str(python_path))
    sys.modules.pop("meta_agentic_alpha_v5", None)
    try:
        from meta_agentic_alpha_v5 import run_meta_conductor_demo

        outcome = run_meta_conductor_demo(timeout=45.0)

        summary_path = working_copy / "storage" / "latest_run_v5.json"
        dashboard_path = working_copy / "meta_agentic_alpha_v5" / "ui" / "dashboard-data-v5.json"
        report_path = working_copy / "meta_agentic_alpha_v5" / "reports" / "generated" / "meta_conductor_masterplan.md"
        scoreboard_path = working_copy / "storage" / "orchestrator_v5" / "scoreboard.json"

        assert summary_path.exists()
        assert dashboard_path.exists()
        assert report_path.exists()
        assert scoreboard_path.exists()

        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))

        assert summary["scenarioId"] == "meta-agentic-alpha-v5"
        alpha_probability = dashboard["metrics"]["alpha_probability"]
        assert 0 <= alpha_probability <= 1.0
        assert dashboard["guardian_mesh"]["coordination"]["quorum"] >= 3
        control_surface = dashboard["control_surface"]
        assert control_surface["guardian_quorum"] >= 3
        assert control_surface["score"] >= 0.5
        assert len(control_surface["session_keys"]) >= 3
        assert "Meta-Conductor" in report_path.read_text(encoding="utf-8")
    finally:
        sys.path.pop(0)
