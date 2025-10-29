from pathlib import Path

from alpha_node.compliance import ComplianceScorecard
from alpha_node.config import (
    AlphaNodeConfig,
    IdentityConfig,
    JobsConfig,
    MetricsConfig,
    PlannerConfig,
    RewardToken,
    SecurityConfig,
    SpecialistConfig,
    StakingConfig,
    StorageConfig,
)
from alpha_node.economy import StakeManagerClient
from alpha_node.ens import ENSVerificationResult
from alpha_node.governance import GovernanceState, SystemPauseManager
from alpha_node.jobs import TaskHarvester
from alpha_node.node import AlphaNode


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


class StubENSVerifier:
    def verify(self, domain: str, owner: str) -> ENSVerificationResult:
        return ENSVerificationResult(domain=domain, expected_owner=owner, resolved_owner=owner, verified=True)


class StubMetrics:
    def __init__(self) -> None:
        self.started = False
        self.last_compliance = 0.0

    def start(self) -> None:
        self.started = True

    def stop(self) -> None:
        self.started = False

    def update_compliance(self, score: float) -> None:
        self.last_compliance = score

    def update_stake(self, stake: int) -> None:
        self.last_stake = stake

    def update_rewards(self, rewards: int) -> None:
        self.last_rewards = rewards

    def increment_completions(self, total: int) -> None:
        self.last_total = total


def test_alpha_node_run_cycle(tmp_path: Path) -> None:
    job_file = tmp_path / "jobs.json"
    job_file.write_text(
        """
[
  {
    "job_id": "FIN-001",
    "description": "Deploy treasury flywheel",
    "base_reward": 12.5,
    "risk": 0.18,
    "metadata": {"domain": "finance"}
  }
]
""",
        encoding="utf-8",
    )
    config = AlphaNodeConfig(
        identity=IdentityConfig(
            ens_domain="demo.alpha.node.agi.eth",
            operator_address="0x000000000000000000000000000000000000dEaD",
            governance_address="0x000000000000000000000000000000000000bEEF",
            rpc_url="http://localhost",
        ),
        security=SecurityConfig(emergency_contact="ops@example", pause_contract="0x000000000000000000000000000000000000c0de"),
        staking=StakingConfig(
            stake_manager_address="0x0000000000000000000000000000000000005a0c",
            min_stake_wei=1_000,
            incentives_address="0x0000000000000000000000000000000000001ace",
            treasury_address="0x0000000000000000000000000000000000007eaa",
            reward_tokens=[RewardToken(symbol="AGIALPHA", address="0x000000000000000000000000000000000000A610")],
        ),
        jobs=JobsConfig(job_router_address="0x0000000000000000000000000000000000000B55", poll_interval_seconds=1),
        planner=PlannerConfig(search_depth=3, exploration_constant=1.1, learning_rate=0.2),
        metrics=MetricsConfig(prometheus_port=0, dashboard_port=0),
        storage=StorageConfig(
            knowledge_path=(tmp_path / "knowledge.db"),
            logs_path=(tmp_path / "logs.jsonl"),
        ),
        specialists=[
            SpecialistConfig(domain="finance", name="Finance Strategist", description="", risk_limit=0.3),
        ],
    )
    stake_client = StakeManagerClient(
        FakeWeb3(),
        config.staking.stake_manager_address,
        config.staking.min_stake_wei,
        [token.__dict__ for token in config.staking.reward_tokens],
    )
    pause_manager = SystemPauseManager(FakeWeb3(), tmp_path / "gov.json")
    pause_manager.bootstrap(config.owner_address, config.governance_address, config.security.pause_contract)
    metrics = StubMetrics()
    node = AlphaNode(
        config=config,
        ens_verifier=StubENSVerifier(),
        stake_client=stake_client,
        task_harvester=TaskHarvester(job_file, loop=False),
        metrics=metrics,
        pause_manager=pause_manager,
        web3=FakeWeb3(),
    )

    node.bootstrap()
    node.stake(config.staking.min_stake_wei)
    result = node.run_once()
    assert result is not None
    assert node.state.ops.completed_jobs == 1
    assert metrics.last_compliance > 0
