import json
from pathlib import Path

import pytest
import sys
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from demo_runner import DayOneUtilityOrchestrator, DemoPausedError, StrategyNotFoundError


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


def test_owner_reset_restores_defaults():
    orchestrator = _orchestrator()
    orchestrator.update_owner_control("platform_fee_bps", "240")
    orchestrator.update_owner_control("owner_address", "0x" + "1" * 40)
    orchestrator.update_owner_control("treasury_address", "0x" + "2" * 40)
    orchestrator.update_owner_control("narrative", "Temporary narrative for reset check.")

    snapshot = orchestrator.reset_owner_controls()

    defaults_path = orchestrator.base_path / "config" / "owner_controls.defaults.yaml"
    defaults_payload = yaml.safe_load(defaults_path.read_text(encoding="utf-8"))

    for key in orchestrator.OWNER_SCHEMA.keys():
        assert snapshot[key] == defaults_payload[key]

    live_payload = yaml.safe_load(
        (orchestrator.base_path / "config" / "owner_controls.yaml").read_text(encoding="utf-8")
    )
    for key in orchestrator.OWNER_SCHEMA.keys():
        assert live_payload[key] == defaults_payload[key]


def test_execute_human_format_summary():
    orchestrator = _orchestrator()
    payload, fmt = orchestrator.execute(["simulate", "--strategy", "e2e", "--format", "human"])
    assert fmt == "human"
    summary = payload["summary"]
    assert "Strategy:" in summary
    assert "Utility uplift" in summary
    assert "Dashboard:" in summary


def test_invalid_owner_address_rejected():
    orchestrator = _orchestrator()
    with pytest.raises(ValueError):
        orchestrator.update_owner_control("owner_address", "invalid-address")
