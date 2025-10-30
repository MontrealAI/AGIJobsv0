from pathlib import Path

from alpha_node.compliance import ComplianceEngine
from alpha_node.config import AlphaNodeConfig
from alpha_node.ens import ENSVerificationResult
from alpha_node.stake import StakeManager
from alpha_node.state import StateStore


def test_compliance_scores_all_dimensions(tmp_path):
    config_path = Path('demo/AGI-Alpha-Node-v0/config.toml')
    config = AlphaNodeConfig.load(config_path)
    store = StateStore(tmp_path / 'state.json')
    stake_manager = StakeManager(config.stake, store, tmp_path / 'ledger.csv')
    stake_manager.deposit(config.stake.minimum_stake)
    store.update(total_rewards=500, antifragility_index=0.9, strategic_alpha_index=0.95)
    engine = ComplianceEngine(config.compliance, store, stake_manager)
    ens_result = ENSVerificationResult(
        domain=config.ens.domain,
        owner=config.ens.owner_address,
        resolver=None,
        verified=True,
        source='test',
    )
    report = engine.evaluate(ens_result)
    assert report.overall > 0.5
    assert len(report.dimensions) == 6
    assert store.read().compliance_score == report.overall
