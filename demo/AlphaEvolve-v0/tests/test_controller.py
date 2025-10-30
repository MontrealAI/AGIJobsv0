import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alphaevolve.config import load_config
from alphaevolve.controller import AlphaEvolveController
from alphaevolve.evaluator import EvaluationHarness
from alphaevolve.metrics import MetricsRegistry
from alphaevolve.program_db import ProgramAtlas
from alphaevolve_runner import _bootstrap_population, _generate_agents, _generate_jobs


def test_controller_generation(tmp_path):
    config = load_config()
    harness = EvaluationHarness(config.baseline_metrics)
    atlas = ProgramAtlas(primary_metric="Utility")
    registry = MetricsRegistry()
    _bootstrap_population(atlas, config.baseline_metrics)
    controller = AlphaEvolveController(config, harness, atlas, registry)
    controller.seed(42)

    agents = _generate_agents()
    jobs = _generate_jobs()

    async def _run_once():
        return await controller.run_generation(1, agents=agents, jobs=jobs)

    report = asyncio.run(_run_once())
    assert report.metrics["Utility"] > 0
    assert report.guardrail.ok
