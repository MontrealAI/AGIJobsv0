import json
import shutil
import sys
from pathlib import Path

import pytest
import yaml

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
    assert "utility_threshold_active" in snapshot_payload
    assert snapshot_payload["utility_threshold_active"] == pytest.approx(
        report["rules"]["utility_uplift_threshold"]
    )

    report_path = orchestrator.output_dir / "report_e2e.json"
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["metrics"]["candidate"]["platform_fee"] > 0
    assert payload["metrics"]["candidate"]["treasury_bonus"] >= 0
    assert payload["metrics"]["latency_p95"] > 0
    thermo = payload["thermodynamics"]
    assert thermo["free_energy_margin"] > 0
    assert thermo["gibbs_free_energy"] > 0
    assert 0 <= thermo["hamiltonian_stability"] <= 1
    assert thermo["entropy_margin_sigma"] >= 0
    assert 0 <= thermo["game_theory_slack"] <= 1


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


def test_core_alias_maps_to_e2e():
    orchestrator = _orchestrator()
    core_report = orchestrator.simulate("core")
    e2e_report = orchestrator.simulate("e2e")

    assert core_report["strategy"] == "e2e"
    assert core_report["strategy_profile"] == e2e_report["strategy_profile"]


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


def test_missing_owner_controls_file_is_self_healed():
    base_path = Path(__file__).resolve().parents[1]
    orchestrator = DayOneUtilityOrchestrator(base_path)
    controls_path = base_path / "config" / "owner_controls.yaml"
    defaults_path = base_path / "config" / "owner_controls.defaults.yaml"

    original = controls_path.read_text(encoding="utf-8")
    controls_path.unlink()

    restored = DayOneUtilityOrchestrator(base_path).load_owner_controls()
    defaults = yaml.safe_load(defaults_path.read_text(encoding="utf-8"))

    for key in orchestrator.OWNER_SCHEMA.keys():
        assert restored[key] == defaults[key]

    controls_path.write_text(original, encoding="utf-8")


def test_missing_owner_field_is_healed_from_defaults():
    orchestrator = _orchestrator()
    controls_path = orchestrator.base_path / "config" / "owner_controls.yaml"
    defaults_path = orchestrator.base_path / "config" / "owner_controls.defaults.yaml"

    live_payload = yaml.safe_load(controls_path.read_text(encoding="utf-8"))
    defaults_payload = yaml.safe_load(defaults_path.read_text(encoding="utf-8"))

    # Drop a field to emulate a partially edited configuration file.
    removed_value = live_payload.pop("narrative")
    controls_path.write_text(yaml.safe_dump(live_payload, sort_keys=False), encoding="utf-8")

    restored = orchestrator.load_owner_controls()

    assert restored["narrative"] == defaults_payload["narrative"]
    rewritten_payload = yaml.safe_load(controls_path.read_text(encoding="utf-8"))
    assert rewritten_payload["narrative"] == defaults_payload["narrative"]
    # Ensure we did not discard the remaining fields.
    for key, value in live_payload.items():
        assert restored[key] == value
    # Restore original for fixture clean-up.
    live_payload["narrative"] = removed_value


def test_owner_utility_guardrail_override():
    orchestrator = _orchestrator()
    orchestrator.update_owner_control("utility_threshold_override_bps", "1200")
    report = orchestrator.simulate("e2e")
    assert report["rules"]["utility_uplift_threshold"] == pytest.approx(0.12)
    assert report["owner_controls"]["utility_threshold_active"] == pytest.approx(0.12)
    assert report["guardrail_pass"]["utility_uplift"] is False


def test_scoreboard_generates_dashboard():
    orchestrator = _orchestrator()
    scoreboard = orchestrator.scoreboard()

    scoreboard_path = orchestrator.output_dir / "scoreboard.json"
    assert scoreboard_path.exists()
    payload = json.loads(scoreboard_path.read_text(encoding="utf-8"))
    assert payload["type"] == "scoreboard"
    assert "e2e" in payload["strategies"]
    assert payload["leaders"]["utility_uplift"]["title"]

    html_path = Path(scoreboard["outputs"]["dashboard"])
    assert html_path.exists()
    html = html_path.read_text(encoding="utf-8")
    assert "Day-One Utility Scoreboard" in html
    assert html.count('class="mermaid"') >= 3
    assert "P95 Latency" in html

    assert "average_latency_p95" in payload["aggregates"]
    assert payload["metrics"]["best_latency_p95"] == pytest.approx(
        payload["leaders"]["latency_p95"]["value"]["latency_p95"]
    )


def test_check_mode_skips_artifacts(monkeypatch):
    base_path = Path(__file__).resolve().parents[1]
    monkeypatch.chdir(base_path)

    output_dir = base_path / "out"
    report_path = output_dir / "report_e2e.json"
    dashboard_path = output_dir / "dashboard_e2e.html"
    snapshot_path = output_dir / "snapshot_e2e.png"
    scoreboard_path = output_dir / "scoreboard.json"

    for path in (report_path, dashboard_path, snapshot_path, scoreboard_path):
        if path.exists():
            path.unlink()

    payload, fmt = run_cli(["simulate", "--strategy", "e2e", "--check"])
    assert fmt == "json"
    assert payload["outputs"]["dashboard"] is None
    assert payload["outputs"]["chart"] is None
    assert not report_path.exists()
    assert not dashboard_path.exists()
    assert not snapshot_path.exists()

    scoreboard_payload, fmt = run_cli(["scoreboard", "--check", "--strategies", "e2e"])
    assert fmt == "json"
    assert scoreboard_payload["outputs"]["dashboard"] is None
    assert not scoreboard_path.exists()


def test_scoreboard_human_summary(monkeypatch):
    base_path = Path(__file__).resolve().parents[1]
    monkeypatch.chdir(base_path)

    payload, fmt = run_cli(["scoreboard", "--format", "human", "--strategies", "e2e"])

    assert fmt == "human"
    summary = payload["summary"]
    assert "Day-One Utility Scoreboard" in summary
    assert "Utility uplift" in summary
    assert "Dashboard:" in summary
    assert "P95 latency" in summary


def test_execute_human_format_summary():
    orchestrator = _orchestrator()
    payload, fmt = orchestrator.execute(["simulate", "--strategy", "e2e", "--format", "human"])
    assert fmt == "human"
    summary = payload["summary"]
    assert "Strategy:" in summary
    assert "Utility uplift" in summary
    assert "Dashboard:" in summary
    assert "P95 latency" in summary


def test_invalid_owner_address_rejected():
    orchestrator = _orchestrator()
    with pytest.raises(ValueError):
        orchestrator.update_owner_control("owner_address", "invalid-address")


def test_run_cli_strategy_flag_alias(monkeypatch):
    base_path = Path(__file__).resolve().parents[1]
    monkeypatch.chdir(base_path)
    payload, fmt = run_cli(["--strategy", "alphaevolve"])
    assert fmt == "json"
    assert payload["strategy"] == "alphaevolve"


def test_run_cli_positional_strategy(monkeypatch):
    base_path = Path(__file__).resolve().parents[1]
    monkeypatch.chdir(base_path)
    payload, fmt = run_cli(["omni"])
    assert fmt == "json"
    assert payload["strategy"] == "omni"


def test_load_jobs_rejects_empty_dataset(tmp_path):
    base_path = tmp_path / "demo"
    shutil.copytree(Path(__file__).resolve().parents[1], base_path)
    microset_path = base_path / "config" / "microset.yaml"
    microset_path.write_text("", encoding="utf-8")

    orchestrator = DayOneUtilityOrchestrator(base_path)
    with pytest.raises(ValueError, match="microset.yaml is empty"):
        orchestrator.load_jobs()


def test_load_jobs_validates_job_entries(tmp_path):
    base_path = tmp_path / "demo"
    shutil.copytree(Path(__file__).resolve().parents[1], base_path)
    microset_path = base_path / "config" / "microset.yaml"
    microset_path.write_text(yaml.safe_dump({"jobs": [{"id": "missing-baseline"}]}), encoding="utf-8")

    orchestrator = DayOneUtilityOrchestrator(base_path)
    with pytest.raises(ValueError, match="Invalid job entry"):
        orchestrator.load_jobs()
