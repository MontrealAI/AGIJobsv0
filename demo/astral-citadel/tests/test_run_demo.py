import importlib.util
import sys
from pathlib import Path


def load_module() -> object:
    module_path = Path(__file__).resolve().parent.parent / "run_demo.py"
    spec = importlib.util.spec_from_file_location("astral_run_demo", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader  # for mypy/static type readers
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)  # type: ignore[arg-type]
    return module


def test_run_demo_outputs(tmp_path: Path) -> None:
    run_demo = load_module()
    plan_path = Path(__file__).resolve().parent.parent / "project-plan.json"
    artifacts = run_demo.run(plan_path, tmp_path)

    markdown = artifacts["markdown"].read_text()
    payload = run_demo.json.loads(artifacts["json"].read_text())

    assert "Astral Citadel Mission Readiness" in markdown
    assert payload["initiative"].startswith("Astral Citadel")
    assert payload["jobs"]["count"] == 6
    assert payload["jobs"]["ordered_ids"][0] == "SUPPLY-NEXUS"
    assert payload["jobs"]["ordered_ids"].index("VALIDATION-SYNTH") > payload["jobs"]["ordered_ids"].index("AID-VANGUARD")


def test_topological_detection_raises_on_cycles(tmp_path: Path) -> None:
    run_demo = load_module()
    cyclic_jobs = [
        run_demo.Job(
            identifier="A",
            title="Cycle A",
            reward=1,
            deadline_days=1,
            dependencies=["B"],
            energy_budget=1.0,
            thermo=run_demo.ThermodynamicProfile(expected_entropy=0.1, adjustment_on_delay="none"),
        ),
        run_demo.Job(
            identifier="B",
            title="Cycle B",
            reward=1,
            deadline_days=1,
            dependencies=["A"],
            energy_budget=1.0,
            thermo=run_demo.ThermodynamicProfile(expected_entropy=0.1, adjustment_on_delay="none"),
        ),
    ]

    try:
        run_demo.topological_order(cyclic_jobs)
    except ValueError as exc:  # pragma: no cover
        assert "Cyclic" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected a cyclic dependency error but none was raised")
