from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")


def test_meta_agentic_alpha_v10_demo(tmp_path: Path) -> None:
    source_dir = Path(__file__).resolve().parents[1]
    working_copy = tmp_path / "Meta-Agentic-ALPHA-AGI-Jobs-v0"
    shutil.copytree(source_dir, working_copy)

    python_path = working_copy / "python"
    repo_root = source_dir.parent.parent
    import sys

    sys.path.insert(0, str(python_path))
    sys.path.insert(0, str(repo_root))
    sys.modules.pop("meta_agentic_alpha_v10", None)
    try:
        from meta_agentic_alpha_v10 import run_meta_omni_demo

        outcome = run_meta_omni_demo(timeout=150.0)

        summary_path = working_copy / "storage" / "latest_run_v10.json"
        dashboard_path = working_copy / "meta_agentic_alpha_v10" / "ui" / "dashboard-data-v10.json"
        report_path = (
            working_copy
            / "meta_agentic_alpha_v10"
            / "reports"
            / "generated"
            / "alpha_meta_omnidominion_masterplan.md"
        )
        scoreboard_path = working_copy / "storage" / "orchestrator_v10" / "scoreboard.json"

        assert summary_path.exists()
        assert dashboard_path.exists()
        assert report_path.exists()
        assert scoreboard_path.exists()

        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))

        assert summary["scenarioId"] == "meta-agentic-alpha-v10"
        metrics = dashboard["metrics"]
        assert metrics["sovereignty_index"] >= 0.9
        assert metrics["unstoppable_readiness"] >= 0.96
        assert metrics["owner_empowerment"] >= 0.9
        assert metrics["superintelligence_yield"] >= 0.9
        assert metrics["alpha_conversion"] >= 0.9
        assert metrics["meta_ci_health"] >= 0.9
        assert metrics["guardian_resilience"] >= 0.85
        assert metrics["owner_command_latency_seconds"] <= 6
        control_surface = dashboard["control_surface"]
        assert control_surface["guardian_quorum"] == 6
        assert control_surface["failover_guardian_count"] >= 5
        assert control_surface["unstoppable_threshold"] >= 0.96
        assert len(control_surface["session_keys"]) >= 8
        assert "omnidominion_pause" in control_surface["omni_switches"]
        assert "redeploy_modules" in control_surface["upgrade_scripts"]
        mermaid = dashboard["mermaid"]
        assert "flow_v10" in mermaid
        assert "radar_v10" in mermaid
        assert "sequence_v10" in mermaid
        report_text = report_path.read_text(encoding="utf-8")
        assert "Omnidominion Masterplan" in report_text

        assert outcome.mandate.unstoppable_target >= 0.95
    finally:
        sys.path.pop(0)
        sys.path.pop(0)
