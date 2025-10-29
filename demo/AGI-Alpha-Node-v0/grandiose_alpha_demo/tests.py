import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "src"))

from agi_alpha_node_demo.alpha_node import AlphaNode
from agi_alpha_node_demo.config import load_demo_config


def test_job_cycle_runs_successfully(tmp_path):
    config = load_demo_config()
    config.knowledge.storage_path = tmp_path / "knowledge.json"
    node = AlphaNode(config)
    node.start()

    result = node.run_job_cycle(job="Test job")

    assert result["compliance"] > 0
    assert result["reinvested"] >= 0
    assert "plan" in result


def test_pause_prevents_execution(tmp_path):
    config = load_demo_config()
    config.knowledge.storage_path = tmp_path / "knowledge.json"
    node = AlphaNode(config)
    node.start()
    node.pause()

    try:
        node.run_job_cycle(job="Test job")
        raised = False
    except RuntimeError:
        raised = True

    assert raised is True
