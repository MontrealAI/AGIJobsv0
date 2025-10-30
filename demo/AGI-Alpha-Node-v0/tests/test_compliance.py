import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "agi_alpha_node"))

from agi_alpha_node.blockchain import BlockchainClient
from agi_alpha_node.compliance import ComplianceEngine
from agi_alpha_node.config import load_config


def test_compliance_produces_score():
    config = load_config()
    blockchain = BlockchainClient(config.blockchain, config.minimum_stake)
    engine = ComplianceEngine(config, blockchain)

    report = engine.evaluate()
    assert 0 <= report.total_score <= 1
    assert len(report.dimensions) == 6
