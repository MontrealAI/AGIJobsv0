from __future__ import annotations

import json
import shutil
from pathlib import Path

def test_meta_agentic_alpha_v6_demo(tmp_path: Path) -> None:
    source_dir = Path(__file__).resolve().parents[1]
    working_copy = tmp_path / "Meta-Agentic-ALPHA-AGI-Jobs-v0"
    shutil.copytree(source_dir, working_copy)

    python_path = working_copy / "python"
    import sys

    sys.path.insert(0, str(python_path))
    sys.modules.pop("meta_agentic_alpha_v6", None)
    try:
        from meta_agentic_alpha_v6 import run_meta_dominion_demo

        outcome = run_meta_dominion_demo(timeout=75.0)

        summary_path = working_copy / "storage" / "latest_run_v6.json"
        dashboard_path = working_copy / "meta_agentic_alpha_v6" / "ui" / "dashboard-data-v6.json"
        report_path = (
            working_copy
            / "meta_agentic_alpha_v6"
            / "reports"
            / "generated"
            / "alpha_dominion_masterplan.md"
        )
        scoreboard_path = working_copy / "storage" / "orchestrator_v6" / "scoreboard.json"

        assert summary_path.exists()
        assert dashboard_path.exists()
        assert report_path.exists()
        assert scoreboard_path.exists()

        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))

        assert summary["scenarioId"] == "meta-agentic-alpha-v6"
        metrics = dashboard["metrics"]
        assert 0 <= metrics["alpha_probability"] <= 1
        assert metrics["alpha_compounding_index"] >= metrics["alpha_probability"]
        control_surface = dashboard["control_surface"]
        assert control_surface["guardian_quorum"] >= 3
        assert control_surface["failover_guardian_count"] >= 1
        assert control_surface["unstoppable_reserve_percent"] >= 15
        assert len(control_surface["session_keys"]) >= 3
        assert "Meta-Dominion" in report_path.read_text(encoding="utf-8")
    finally:
        sys.path.pop(0)
