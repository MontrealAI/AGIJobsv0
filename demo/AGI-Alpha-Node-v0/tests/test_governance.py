from __future__ import annotations

from pathlib import Path

from agi_alpha_node_demo.blockchain.client import MockBlockchainClient
from agi_alpha_node_demo.blockchain.governance import GovernanceController, SystemPauseController
from agi_alpha_node_demo.config import load_config


def _load_config() -> str:
    base = Path(__file__).resolve().parents[1]
    return str(base / "config" / "alpha_node.example.yml")


def test_mock_governance_transfers(tmp_path) -> None:
    config = load_config(_load_config())
    client = MockBlockchainClient(config, Path(__file__).resolve().parents[1])
    controller = GovernanceController(client)
    result = controller.transfer_governance("0x1234567890abcdef1234567890abcdef12345678")
    assert result["status"] == "mock"


def test_system_pause_mock_state(tmp_path) -> None:
    config = load_config(_load_config())
    client = MockBlockchainClient(config, Path(__file__).resolve().parents[1])
    pause = SystemPauseController(client)
    status = pause.status()
    assert status.paused is False
    pause.pause_all(config.operator_address)
    assert pause.status().paused is True
    pause.unpause_all(config.operator_address)
    assert pause.status().paused is False
