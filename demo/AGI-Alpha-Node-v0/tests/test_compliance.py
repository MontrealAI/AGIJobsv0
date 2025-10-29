from pathlib import Path

from alpha_node.compliance import ComplianceScorecard
from alpha_node.economy import StakeStatus
from alpha_node.ens import ENSVerificationResult
from alpha_node.governance import GovernanceState


def test_compliance_scoring(tmp_path: Path) -> None:
    ens = ENSVerificationResult(domain="demo", expected_owner="0x0000000000000000000000000000000000000000", resolved_owner="0x0000000000000000000000000000000000000000", verified=True)
    stake = StakeStatus(staked_wei=200, min_stake_wei=100, rewards_wei=50, slashing_risk=False)
    governance = GovernanceState(owner="0x1", governance_address="0x2", pause_contract="0x3")
    scores = ComplianceScorecard().evaluate(
        ens_result=ens,
        stake_status=stake,
        governance=governance,
        planner_trend=0.8,
        antifragility_checks={"drill": True, "pause_resume": True},
    )
    assert scores.total >= 0.8
