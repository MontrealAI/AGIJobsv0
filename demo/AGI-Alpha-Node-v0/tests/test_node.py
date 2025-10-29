from pathlib import Path

from web3 import Web3

from alpha_node.compliance import ComplianceScorecard
from alpha_node.economy import StakeManagerClient
from alpha_node.ens import ENSVerificationResult
from alpha_node.governance import GovernanceState, SystemPauseManager


class FakeEth:
    block_number = 123


class FakeWeb3:
    eth = FakeEth()


def test_governance_pause_cycle(tmp_path: Path) -> None:
    manager = SystemPauseManager(FakeWeb3(), tmp_path / "gov.json")
    state = manager.bootstrap(
        owner="0x000000000000000000000000000000000000dead",
        governance_address="0x000000000000000000000000000000000000beef",
        pause_contract="0x000000000000000000000000000000000000c0de",
    )
    manager.pause("maintenance")
    assert manager.state.paused is True
    manager.resume("complete")
    assert manager.state.paused is False
    manager.rotate_governance("0x000000000000000000000000000000000000c0fe", "upgrade")
    assert manager.state.governance_address.lower().endswith("c0fe")
    manager.load()
    assert manager.state.governance_address.lower().endswith("c0fe")


def test_compliance_integration(tmp_path: Path) -> None:
    web3 = FakeWeb3()
    stake = StakeManagerClient(
        web3,
        "0x0000000000000000000000000000000000005a0c",
        1000,
        [{"symbol": "AGIALPHA", "address": "0x000000000000000000000000000000000000a610"}],
    )
    stake.deposit(1500, "0x000000000000000000000000000000000000dead")
    stake.accrue_rewards(250)
    governance = GovernanceState(
        owner="0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        governance_address="0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
        pause_contract="0xc0dec0dec0dec0dec0dec0dec0dec0dec0dec0de",
        paused=False,
    )
    scores = ComplianceScorecard().evaluate(
        ens_result=ENSVerificationResult(
            domain="demo.alpha.node.agi.eth",
            expected_owner="0x000000000000000000000000000000000000dead",
            resolved_owner="0x000000000000000000000000000000000000dead",
            verified=True,
        ),
        stake_status=stake.status(),
        governance=governance,
        planner_trend=0.85,
        antifragility_checks={"drill": True, "pause_resume": True},
    )
    assert scores.total > 0.8
