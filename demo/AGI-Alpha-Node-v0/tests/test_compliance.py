from alpha_node.compliance import ComplianceEngine
from alpha_node.state import AlphaNodeState


def test_compliance_scores() -> None:
    state = AlphaNodeState(governance_address="0xabc")
    state.set_ens_verified(True)
    state.update_stake(1000)
    state.accrue_rewards(500)
    state.register_completion("job-1", True)
    engine = ComplianceEngine(state, required_stake=1000)
    score = engine.evaluate()
    assert 0 < score.composite <= 1
    assert score.dimensions["identity"] == 1.0
    assert score.dimensions["staking"] == 1.0
