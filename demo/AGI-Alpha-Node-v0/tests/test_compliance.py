from agi_alpha_node.compliance import ComplianceEngine
from agi_alpha_node.ens import ENSVerificationResult
from agi_alpha_node.staking import StakeStatus


def test_compliance_scores() -> None:
    engine = ComplianceEngine()
    snapshot = engine.build_snapshot(
        ens=ENSVerificationResult(True, "0x123"),
        stake=StakeStatus(staked_amount=2000, minimum_required=1000, rewards_available=500),
        governance_ready=True,
        antifragile_health=0.9,
        intelligence_velocity=0.95,
    )
    assert snapshot.aggregate > 0.8
    assert "Identity & ENS" in snapshot.scores
    mermaid = snapshot.mermaid()
    assert "radar" in mermaid
