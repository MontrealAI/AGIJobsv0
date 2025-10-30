import json
from pathlib import Path

import pytest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from demo_runner import DayOneUtilityOrchestrator, DemoPausedError, StrategyNotFoundError, run_cli


def _orchestrator() -> DayOneUtilityOrchestrator:
    return DayOneUtilityOrchestrator(Path(__file__).resolve().parents[1])


@pytest.fixture(autouse=True)
def restore_owner_controls():
    orchestrator = _orchestrator()
    path = orchestrator.base_path / "config" / "owner_controls.yaml"
    original = path.read_text(encoding="utf-8")
    yield
    path.write_text(original, encoding="utf-8")


def test_simulate_e2e_outputs():
    orchestrator = _orchestrator()
    report = orchestrator.simulate("e2e")

    assert report["guardrail_pass"]["utility_uplift"] is True
    assert report["guardrail_pass"]["latency_delta"] is True

    dashboard = Path(report["outputs"]["dashboard"])
    assert dashboard.exists()
    html = dashboard.read_text(encoding="utf-8")
    assert "Day-One Utility Benchmark" in html
    assert "class=\"mermaid\"" in html

    owner_snapshot = orchestrator.output_dir / "owner_controls_snapshot.json"
    assert owner_snapshot.exists()
    snapshot_payload = json.loads(owner_snapshot.read_text(encoding="utf-8"))
    assert snapshot_payload["owner_address"].startswith("0x")

    report_path = orchestrator.output_dir / "report_e2e.json"
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["metrics"]["candidate"]["platform_fee"] > 0
    assert payload["metrics"]["candidate"]["treasury_bonus"] >= 0


def test_pause_blocks_simulation():
    orchestrator = _orchestrator()
    snapshot = orchestrator.toggle_pause()
    assert snapshot["paused"] is True
    with pytest.raises(DemoPausedError):
        orchestrator.simulate("e2e")
    orchestrator.toggle_pause()
    report = orchestrator.simulate("e2e")
    assert report["guardrail_pass"]["utility_uplift"]


def test_owner_set_updates_fee():
    orchestrator = _orchestrator()
    updated = orchestrator.update_owner_control("platform_fee_bps", "220")
    assert updated["platform_fee_bps"] == 220
    report = orchestrator.simulate("e2e")
    assert report["owner_controls"]["platform_fee_bps"] == 220


def test_unknown_strategy_raises():
    orchestrator = _orchestrator()
    with pytest.raises(StrategyNotFoundError):
        orchestrator.simulate("unknown")


def test_owner_explain_provides_context():
    orchestrator = _orchestrator()
    explanation = orchestrator.explain_owner_controls()
    assert "owner_controls" in explanation
    lines = explanation["explanation"]
    assert any("Platform fee" in line for line in lines)
    assert any("Latency" in line for line in lines)


def test_run_cli_narrative_format():
    payload = run_cli(["simulate", "--strategy", "e2e", "--format", "narrative"])
    assert "report" in payload
    assert "narrative" in payload
    assert "Utility uplift" in payload["narrative"]
    assert payload["report"]["cli"]["summary"] == payload["narrative"]
