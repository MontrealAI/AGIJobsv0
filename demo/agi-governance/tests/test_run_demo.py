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
    assert metrics["partition_function"] is None
    assert metrics["partition_status"] == "underflow"
    assert metrics["log_partition_function"] < -1000
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


def test_partition_matches_direct_small_oracle():
    import math
    runner = _load_runner()
    levels = [runner.EnergyLevel(1.0, 2), runner.EnergyLevel(3.0, 4)]
    actual = runner._stable_partition(levels, .5, 2)
    z = 2 * math.exp(-1) + 4 * math.exp(-3)
    assert actual["partition_function"] == pytest.approx(z)
    assert actual["log_partition_function"] == pytest.approx(math.log(z))
    assert actual["expected_energy_kj"] == pytest.approx((4 * math.exp(-1) + 24 * math.exp(-3)) / z)


@pytest.mark.parametrize("energy,status", [(10000., "underflow"), (-10000., "overflow")])
def test_large_partition_stays_finite_in_log_space(energy, status):
    import math
    runner = _load_runner()
    actual = runner._stable_partition([runner.EnergyLevel(energy, 2)], 1., 1.)
    assert actual["partition_function"] is None
    assert actual["partition_status"] == status
    assert actual["log_partition_function"] == pytest.approx(math.log(2) - energy)
    assert actual["expected_energy_kj"] == energy
    json.dumps(actual, allow_nan=False)


@pytest.mark.parametrize("energy,beta,degeneracy", [(float("nan"),1.,1),(1.,float("inf"),1),(1.,1.,0),(1.,1.,True)])
def test_invalid_partition_inputs_fail_closed(energy,beta,degeneracy):
    runner = _load_runner()
    with pytest.raises(ValueError):
        runner._stable_partition([runner.EnergyLevel(energy,degeneracy)],beta,1.)


def test_owner_control_only_wrapper_omits_thermodynamics_explicitly():
    runner = _load_runner()
    mission = runner.Mission.from_payload({"meta":{"title":"Owner controls only"},
        "ownerControls":{"requiredCategories":["pause"], "criticalCapabilities":[]},
        "gameTheory":{}})
    actual = runner.compute_governance_metrics(mission)
    assert actual["missing_owner_categories"] == ["pause"]
    assert actual["partition_status"] == "not-supplied"
    for key in ["partition_function","log_partition_function","shifted_normalization","expected_energy_kj"]:
        assert actual[key] is None
    assert "not-supplied" in runner._format_report(actual)
