import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "agi_alpha_node"))

from agi_alpha_node.blockchain import BlockchainClient
from agi_alpha_node.config import load_config
from agi_alpha_node.knowledge import KnowledgeLake
from agi_alpha_node.orchestrator import Orchestrator


def test_orchestrator_executes_jobs(tmp_path):
    config = load_config()
    config.knowledge_path = tmp_path / "knowledge.sqlite"
    blockchain = BlockchainClient(config.blockchain, config.minimum_stake)
    knowledge = KnowledgeLake(config.knowledge_path)
    orchestrator = Orchestrator(blockchain, knowledge)

    jobs = list(blockchain.available_jobs())
    results = orchestrator.evaluate_and_execute(jobs)
    assert len(results) == len(jobs)
    assert all(result.reward > 0 for result in results)
