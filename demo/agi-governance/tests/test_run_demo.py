from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest


FIXTURE_ROOT = Path(__file__).resolve().parent.parent
RUNNER_PATH = FIXTURE_ROOT / "run_demo.py"
MISSION_PATH = FIXTURE_ROOT / "config" / "mission@v1.json"


def _load_runner() -> ModuleType:
    spec = importlib.util.spec_from_file_location("demo.agi_governance.run_demo", RUNNER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)  # type: ignore[assignment]
    return module


def test_mission_loads_fixture() -> None:
    runner = _load_runner()
    mission = runner.load_mission(MISSION_PATH)
    assert mission.title.startswith("Solving α-AGI Governance")
    assert mission.enthalpy_kj > 70000


def test_metrics_capture_thermo_and_strategy_entropy() -> None:
    runner = _load_runner()
    mission = runner.load_mission(MISSION_PATH)
    metrics = runner.compute_governance_metrics(mission)

    assert pytest.approx(metrics["gibbs_free_energy_kj"], rel=1e-6) == 69800.0
    assert metrics["partition_function"] > 0
    assert metrics["expected_energy_kj"] >= 0
    assert 0 < metrics["strategy_entropy"] < 2
    assert metrics["missing_owner_categories"] == []


def test_cli_json_output(capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch) -> None:
    runner = _load_runner()
    monkeypatch.setattr(
        runner,  # type: ignore[arg-type]
        "parse_args",
        lambda: type("Args", (), {"mission": MISSION_PATH, "json": True})(),
    )
    runner.main()
    payload = json.loads(capsys.readouterr().out)

    assert payload["title"].startswith("Solving α-AGI Governance")
    assert "gibbs_free_energy_kj" in payload
    assert payload["missing_owner_categories"] == []
