from decimal import Decimal
from pathlib import Path

from agi_alpha_node_demo.blockchain import BlockchainClient
from agi_alpha_node_demo.compliance import ComplianceEngine
from agi_alpha_node_demo.config import AlphaNodeConfig, JobsConfig, KnowledgeLakeConfig, MetricsConfig, NetworkConfig, OperatorConfig, PlannerConfig, SafetyConfig, SpecialistConfig, StakingConfig


def build_config(tmp_path: Path) -> AlphaNodeConfig:
    return AlphaNodeConfig(
        network=NetworkConfig(chain_endpoint="http://localhost", chain_id=1, ens_registry="0x0"),
        operator=OperatorConfig(
            owner_address="0x1234567890abcdef1234567890abcdef12345678",
            governance_address="0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
            ens_domain="demo.alpha.node.agi.eth",
            pause_key_path=str(tmp_path / "pause.key"),
        ),
        staking=StakingConfig(minimum_stake=Decimal("100"), current_stake=Decimal("150"), token_symbol="$AGIALPHA"),
        knowledge_lake=KnowledgeLakeConfig(database_path=str(tmp_path / "knowledge.sqlite3")),
        metrics=MetricsConfig(bind_host="127.0.0.1", bind_port=9700),
        safety=SafetyConfig(auto_pause_on_failure=True, invariant_checks=["ens_verified", "stake_sufficient", "governance_configured"]),
        planner=PlannerConfig(rollout_depth=2, simulations=4, discount=0.95, exploration_constant=1.1),
        specialists=[SpecialistConfig(name="finance")],
        jobs=JobsConfig(default_reinvestment_rate=0.5, heartbeat_seconds=15),
    )


def test_compliance_generates_scores(tmp_path: Path):
    config = build_config(tmp_path)
    client = BlockchainClient(endpoint="http://localhost", chain_id=1, ens_registry="0x0")
    engine = ComplianceEngine(config, client)
    report = engine.evaluate()
    assert 0 <= report.total_score <= 1
    assert len(report.dimensions) == 6
