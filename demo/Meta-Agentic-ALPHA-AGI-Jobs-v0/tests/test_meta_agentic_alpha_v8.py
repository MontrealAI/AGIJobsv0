from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")


def test_meta_agentic_alpha_v8_demo(tmp_path: Path) -> None:
    source_dir = Path(__file__).resolve().parents[1]
    working_copy = tmp_path / "Meta-Agentic-ALPHA-AGI-Jobs-v0"
    shutil.copytree(source_dir, working_copy)

    python_path = working_copy / "python"
    repo_root = source_dir.parent.parent
    import sys

    sys.path.insert(0, str(python_path))
    sys.path.insert(0, str(repo_root))
    sys.modules.pop("meta_agentic_alpha_v8", None)
    try:
        from meta_agentic_alpha_v8 import run_meta_convergence_demo

        outcome = run_meta_convergence_demo(timeout=90.0)

        summary_path = working_copy / "storage" / "latest_run_v8.json"
        dashboard_path = working_copy / "meta_agentic_alpha_v8" / "ui" / "dashboard-data-v8.json"
        report_path = (
            working_copy
            / "meta_agentic_alpha_v8"
            / "reports"
            / "generated"
            / "alpha_meta_convergence_masterplan.md"
        )
        scoreboard_path = working_copy / "storage" / "orchestrator_v8" / "scoreboard.json"

        assert summary_path.exists()
        assert dashboard_path.exists()
        assert report_path.exists()
        assert scoreboard_path.exists()

        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))

        assert summary["scenarioId"] == "meta-agentic-alpha-v8"
        metrics = dashboard["metrics"]
        assert 0 <= metrics["alpha_probability"] <= 1
        assert metrics["alpha_compounding_index"] >= metrics["alpha_probability"]
        assert metrics["unstoppable_readiness"] >= 0.8
        assert metrics["automation_aperture"] >= 0.65
        assert metrics["capital_flywheel_index"] >= 0.8
        assert metrics["convergence_velocity"] >= 0.75
        assert metrics["guardian_resilience"] >= 0.75
        control_surface = dashboard["control_surface"]
        assert control_surface["guardian_quorum"] >= 4
        assert control_surface["failover_guardian_count"] >= 3
        assert control_surface["unstoppable_reserve_percent"] >= 40
        assert len(control_surface["session_keys"]) >= 5
        report_text = report_path.read_text(encoding="utf-8")
        assert "Meta-Agentic α-Convergence Masterplan" in report_text
    finally:
        sys.path.pop(0)
        sys.path.pop(0)
