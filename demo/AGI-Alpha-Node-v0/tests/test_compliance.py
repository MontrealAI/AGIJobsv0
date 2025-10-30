from __future__ import annotations

from agi_alpha_node_demo.compliance.scorecard import ComplianceScorecard


def test_compliance_scores_all_dimensions() -> None:
    scorecard = ComplianceScorecard()
    score = scorecard.compute(
        ens_verified=True,
        stake_ok=True,
        governance_address="0x0000000000000000000000000000000000000001",
        pause_status=False,
        rewards_growth=0.8,
        antifragility_score=0.9,
        intelligence_score=0.95,
    )
    assert score.total > 0.5
    assert len(score.dimensions) == 6
    assert all(0 <= dimension.score <= 1 for dimension in score.dimensions)
