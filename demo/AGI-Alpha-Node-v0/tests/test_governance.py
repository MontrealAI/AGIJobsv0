from pathlib import Path

from alpha_node.config import AlphaNodeConfig
from alpha_node.governance import GovernanceController
from alpha_node.state import StateStore


def test_pause_and_resume_update_state(tmp_path):
    config = AlphaNodeConfig.load(Path('demo/AGI-Alpha-Node-v0/config.toml'))
    store = StateStore(tmp_path / 'state.json')
    controller = GovernanceController(config.governance, store)
    controller.pause_all('test')
    assert store.read().paused is True
    controller.resume_all('test')
    assert store.read().paused is False
