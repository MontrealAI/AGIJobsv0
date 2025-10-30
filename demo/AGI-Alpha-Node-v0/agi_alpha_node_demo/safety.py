"""Safety and pause controls."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict

from .blockchain import BlockchainClient

LOGGER = logging.getLogger("agi_alpha_node_demo.safety")


class PauseController:
    def __init__(self, state_path: Path, blockchain: BlockchainClient) -> None:
        self.state_path = state_path
        self.blockchain = blockchain
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.state_path.exists():
            self._write_state({"paused": False})

    def _write_state(self, state: Dict[str, bool]) -> None:
        self.state_path.write_text(json.dumps(state))

    def _read_state(self) -> Dict[str, bool]:
        return json.loads(self.state_path.read_text())

    def pause(self) -> str:
        state = self._read_state()
        if state.get("paused"):
            LOGGER.info("Node already paused")
            return "already-paused"
        tx_hash = self.blockchain.broadcast_pause()
        self._write_state({"paused": True})
        LOGGER.warning("Node paused", extra={"tx_hash": tx_hash})
        return tx_hash

    def resume(self) -> str:
        state = self._read_state()
        if not state.get("paused"):
            LOGGER.info("Node already active")
            return "already-active"
        tx_hash = self.blockchain.broadcast_resume()
        self._write_state({"paused": False})
        LOGGER.info("Node resumed", extra={"tx_hash": tx_hash})
        return tx_hash

    def is_paused(self) -> bool:
        return self._read_state().get("paused", False)
