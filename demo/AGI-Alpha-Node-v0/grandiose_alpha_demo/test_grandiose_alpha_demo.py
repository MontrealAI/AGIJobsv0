import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SRC_PATH = BASE_DIR / "src"
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))


def _ensure_grandiose_demo_package() -> None:
    module = sys.modules.get("agi_alpha_node_demo")
    if not module:
        return

    module_file = getattr(module, "__file__", "") or ""
    module_paths = [str(path) for path in getattr(module, "__path__", [])]
    if str(SRC_PATH) in module_file or any(str(SRC_PATH) in path for path in module_paths):
        return

    for name in list(sys.modules):
        if name == "agi_alpha_node_demo" or name.startswith("agi_alpha_node_demo."):
            sys.modules.pop(name, None)


_ensure_grandiose_demo_package()

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
