from __future__ import annotations

from dataclasses import dataclass

from .blockchain import BlockchainClient
from .config import Config
from .logging_utils import json_log


@dataclass
class GovernanceController:
    config: Config
    blockchain: BlockchainClient

    def transfer_governance(self, new_address: str) -> None:
        self.blockchain.transfer_governance(new_address)
        json_log("governance_rotated", new_address=new_address)

    def pause(self, reason: str) -> None:
        self.blockchain.pause(reason)

    def resume(self) -> None:
        self.blockchain.resume()

    def status(self) -> dict:
        return {
            "governance_address": self.blockchain.get_governance_address(),
            "paused": self.blockchain.is_paused(),
        }
