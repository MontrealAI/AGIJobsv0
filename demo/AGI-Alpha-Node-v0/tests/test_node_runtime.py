import pytest

from alpha_node.config import AlphaNodeConfig
from alpha_node.node import AlphaNode


def test_activation_requires_suffix(demo_workspace):
    config = AlphaNodeConfig.load(demo_workspace / "config.toml")
    config.ens.domain = "demo.alpha.agent.agi.eth"
    node = AlphaNode(config, base_path=demo_workspace)
    with pytest.raises(ValueError):
        node.activate()


def test_activation_top_up_and_compliance(demo_workspace):
    config = AlphaNodeConfig.load(demo_workspace / "config.toml")
    node = AlphaNode(config, base_path=demo_workspace)
    report = node.activate(auto_top_up=True)
    assert report.dimensions["identity"].score == 1.0
    state = node.state_store.read()
    assert state.stake_locked >= config.stake.minimum_stake


def test_autopilot_restakes_rewards(demo_workspace):
    config = AlphaNodeConfig.load(demo_workspace / "config.toml")
    node = AlphaNode(config, base_path=demo_workspace)
    node.stake_manager.deposit(config.stake.minimum_stake)
    node.state_store.update(
        stake_locked=config.stake.minimum_stake,
        total_rewards=config.stake.restake_threshold + 25,
    )
    payload = node.autopilot(cycles=1, restake=True, safety_interval=0)
    assert payload["executed_cycles"] >= 0
    state = node.state_store.read()
    assert state.total_rewards == 0.0
    assert any("autopilot-cycle" in entry for entry in state.audit_log)
