import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import pytest

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "demo/CELESTIAL-SOVEREIGN-ORBITAL-AGI-OS-GRAND-DEMONSTRATION"
spec = importlib.util.spec_from_file_location("celestial_run", DEMO / "run.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def scenario():
    return json.loads((DEMO / "scenario.json").read_text())


def test_default_resource_conservation_and_displacement():
    result = module.evaluate(scenario())
    assert result["normal"]["allocated"] == {"energyUnits": 85, "computeUnits": 90}
    assert result["outage"]["allocated"] == {"energyUnits": 45, "computeUnits": 40}
    assert result["outage"]["remaining"] == {"energyUnits": 10, "computeUnits": 5}
    assert result["displacedIds"] == ["indexing", "archive"]
    assert result["normal"]["conserved"] and result["outage"]["conserved"]
    assert result["productionApproved"] is False


def test_capacity_outage_below_reserve_pauses_all_jobs():
    data = scenario()
    data["outageCapacity"]["energyUnits"] = 5
    result = module.evaluate(data)["outage"]
    assert result["dispatchPaused"]
    assert result["reserveShortfall"]["energyUnits"] == 5
    assert all(r["reasons"] == ["protected-reserve-shortfall"] for r in result["jobs"])
    assert result["allocated"] == {"energyUnits": 0, "computeUnits": 0}


def test_priority_ties_preserve_input_order_and_later_small_job_can_fit():
    data = scenario()
    data["normalCapacity"] = {"energyUnits": 20, "computeUnits": 20}
    data["outageCapacity"] = dict(data["normalCapacity"])
    data["protectedReserve"] = {"energyUnits": 0, "computeUnits": 0}
    data["jobs"] = [
        {
            "id": "large",
            "label": "Large",
            "priority": 50,
            "energyUnits": 30,
            "computeUnits": 30,
        },
        {
            "id": "small",
            "label": "Small",
            "priority": 50,
            "energyUnits": 10,
            "computeUnits": 10,
        },
    ]
    result = module.evaluate(data)
    assert result["allocationOrder"] == ["large", "small"]
    assert [x["status"] for x in result["normal"]["jobs"]] == ["deferred", "reserved"]


def test_integer_bounds_and_strict_shape():
    for change in [
        lambda x: x.update(extra=1),
        lambda x: x["normalCapacity"].update(energyUnits=True),
        lambda x: x["normalCapacity"].update(energyUnits=1000001),
        lambda x: x["jobs"][0].update(priority=-1),
        lambda x: x["jobs"][1].update(id=x["jobs"][0]["id"]),
        lambda x: x["jobs"][0].update(energyUnits=0, computeUnits=0),
        lambda x: x["outageCapacity"].update(energyUnits=101),
        lambda x: x["protectedReserve"].update(computeUnits=101),
    ]:
        data = scenario()
        change(data)
        with pytest.raises(ValueError):
            module.evaluate(data)


def test_duplicate_nonfinite_invalid_encoding_and_oversize_rejected():
    for raw in [
        b'{"x":1,"x":2}',
        b'{"x":NaN}',
        b'{"x":Infinity}',
        b"\xff",
        b" " * 1000001,
    ]:
        with pytest.raises(ValueError):
            module.parse_scenario(raw)


def test_inputs_not_mutated_and_repeated_plans_identical():
    data = scenario()
    before = copy.deepcopy(data)
    assert module.evaluate(data) == module.evaluate(data)
    assert data == before


def test_maximum_units_remain_exact_and_conserved():
    data = scenario()
    data["normalCapacity"] = data["outageCapacity"] = {
        "energyUnits": 1000000,
        "computeUnits": 1000000,
    }
    data["protectedReserve"] = {"energyUnits": 1, "computeUnits": 1}
    data["jobs"] = [
        {
            "id": f"job-{i}",
            "label": "Work",
            "priority": i,
            "energyUnits": 19999,
            "computeUnits": 19999,
        }
        for i in range(50)
    ]
    result = module.evaluate(data)["normal"]
    assert result["allocated"]["energyUnits"] == 999950
    assert result["remaining"]["energyUnits"] == 49
    assert result["conserved"]


def test_friendly_cli_errors_and_exact_byte_hash(tmp_path):
    missing = subprocess.run(
        [sys.executable, str(DEMO / "run.py"), str(tmp_path / "missing.json")],
        capture_output=True,
        text=True,
    )
    assert missing.returncode == 2 and "Traceback" not in missing.stderr
    import hashlib

    result = subprocess.run(
        [sys.executable, str(DEMO / "run.py")],
        capture_output=True,
        text=True,
        check=True,
    )
    assert (
        json.loads(result.stdout)["scenarioSha256"]
        == hashlib.sha256((DEMO / "scenario.json").read_bytes()).hexdigest()
    )


def test_whitespace_padding_cannot_bypass_text_limits():
    for field in ["title", "label"]:
        data = scenario()
        if field == "title":
            data["title"] = " " * 201 + "x"
        else:
            data["jobs"][0]["label"] = "x" + " " * 101
        with pytest.raises(ValueError):
            module.evaluate(data)
