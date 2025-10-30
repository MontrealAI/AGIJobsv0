from __future__ import annotations

import asyncio
import os
from pathlib import Path

os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

from demo.AlphaEvolve_v0 import alphaevolve_demo as demo_pkg
from demo.AlphaEvolve_v0.alphaevolve_demo.controller import AlphaEvolveController, ControllerConfig


def test_diff_application_round_trip() -> None:
    original = "value = 1"
    diff = "<<<<<< SEARCH\nvalue = 1\n======\nvalue = 2\n>>>>>> REPLACE"
    mutated = demo_pkg.diffing.apply_diff(original, diff)
    assert "value = 2" in mutated


def test_sandbox_rejects_forbidden_import() -> None:
    forbidden = "import os\nfrom math import sqrt\n"
    sb = demo_pkg.sandbox.HeuristicSandbox()
    try:
        sb.compile(forbidden)
    except demo_pkg.sandbox.SandboxError:
        assert True
    else:
        raise AssertionError("Sandbox should reject forbidden imports")


def test_evaluation_improves_with_local_mutator(tmp_path: Path) -> None:
    baseline_code = demo_pkg.cli.load_baseline_code()
    agents = demo_pkg.cli.create_default_agents()
    jobs = demo_pkg.cli.create_default_jobs()
    controller = AlphaEvolveController(
        baseline_code,
        agents,
        jobs,
        ControllerConfig(max_generations=2, baseline_metrics={}),
        tmp_path / "alphaevolve_manifest.json",
    )
    asyncio.run(controller.run())
    assert controller.current_metrics is not None
    assert controller.current_metrics.utility > 0
    assert controller.database.best() is not None


def test_telemetry_snapshot_formatting() -> None:
    snapshot = demo_pkg.telemetry.MetricSnapshot(generation=1, utility=10, gmv=20, cost=5, latency=1.2, fairness=0.9)
    telem = demo_pkg.telemetry.Telemetry()
    telem.record_generation(1, snapshot)
    report = telem.render_report()
    assert "Gen 1" in report

