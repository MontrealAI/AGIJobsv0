from __future__ import annotations

from pathlib import Path

import pytest

from agi_alpha_node_demo.blockchain.contracts import MockLedger, StakeManagerClient
from alpha_node.config import StakeSettings
from alpha_node.state import StateStore
from alpha_node.stake import StakeManager


def test_stake_manager_rejects_invalid_amounts(tmp_path: Path) -> None:
    store = StateStore(tmp_path / "state.json")
    settings = StakeSettings(
        asset_symbol="AGI",
        minimum_stake=1.0,
        restake_threshold=0.5,
        reward_address="0xdead",
    )
    manager = StakeManager(settings, store, tmp_path / "ledger.csv")

    with pytest.raises(ValueError):
        manager.deposit(0)
    with pytest.raises(ValueError):
        manager.deposit(-1)
    with pytest.raises(ValueError):
        manager.slash(0)
    with pytest.raises(ValueError):
        manager.accrue_rewards(float("inf"))


def test_stake_manager_client_rejects_invalid_amounts() -> None:
    client = StakeManagerClient(MockLedger())

    with pytest.raises(ValueError):
        client.deposit("0xabc", 0)
    with pytest.raises(ValueError):
        client.deposit("0xabc", -5)
