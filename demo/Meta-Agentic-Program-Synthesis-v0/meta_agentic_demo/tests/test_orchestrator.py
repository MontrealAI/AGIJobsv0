from __future__ import annotations

from meta_agentic_demo.config import DemoConfig, DemoScenario
from meta_agentic_demo.orchestrator import SovereignArchitect


def test_orchestrator_generates_artifacts(tmp_path) -> None:
    scenario = DemoScenario(
        identifier="alpha",
        title="Alpha",
        description="",
        target_metric="score",
        success_threshold=0.5,
    )
    config = DemoConfig(scenarios=[scenario])
    architect = SovereignArchitect(config=config)
    artefacts = architect.run(scenario)
    assert artefacts.final_score > 0
    assert len(artefacts.jobs) == config.evolution_policy.generations
    assert artefacts.rewards
    assert artefacts.performances
