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
    summary = artefacts.reward_summary
    assert summary.total_reward > 0
    assert summary.top_solver is not None
    assert artefacts.improvement_over_first >= 0
    assert artefacts.owner_actions == []
    assert artefacts.timelock_actions == []
    assert artefacts.opportunities
    for opportunity in artefacts.opportunities:
        assert 0.0 <= opportunity.impact_score <= 1.0
        assert 0.0 <= opportunity.confidence <= 1.0
        assert 0.0 <= opportunity.energy_ratio <= 1.0
        assert 0.0 <= opportunity.capital_allocation <= 1.0
        assert opportunity.narrative
    verification = artefacts.verification
    assert isinstance(verification.holdout_scores, dict)
    assert verification.holdout_scores
    assert verification.residual_std >= 0
    assert verification.divergence >= 0
    assert verification.mae_score >= 0
    assert isinstance(verification.bootstrap_interval, tuple)
    assert len(verification.bootstrap_interval) == 2
    assert verification.monotonic_violations >= 0
    assert isinstance(verification.stress_scores, dict)
    assert verification.stress_scores
    assert 0 <= verification.stress_threshold <= 1
    assert 0 <= verification.entropy_score <= 1
    assert isinstance(verification.pass_entropy, bool)
    assert 0 <= verification.entropy_floor <= 1
