"""Governance and pause controls."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict

from web3 import Web3
from web3.contract import Contract

from .client import Web3Config, get_web3

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class SystemPause:
    config: Web3Config
    contract_address: str
    abi: list

    def _contract(self) -> Contract:
        web3 = get_web3(self.config)
        return web3.eth.contract(address=Web3.to_checksum_address(self.contract_address), abi=self.abi)

    def is_paused(self) -> bool:
        paused = bool(self._contract().functions.paused().call())
        logger.debug("Checked pause status", extra={"paused": paused})
        return paused

    def build_pause_tx(self, caller: str) -> Dict[str, int]:
        contract = self._contract()
        web3 = get_web3(self.config)
        transaction = contract.functions.pauseAll().build_transaction({
            "from": Web3.to_checksum_address(caller),
            "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(caller)),
            "gas": 250000,
            "gasPrice": web3.eth.gas_price,
        })
        logger.warning("Prepared emergency pause transaction", extra={"caller": caller})
        return transaction

    def build_unpause_tx(self, caller: str) -> Dict[str, int]:
        contract = self._contract()
        web3 = get_web3(self.config)
        transaction = contract.functions.unpauseAll().build_transaction({
            "from": Web3.to_checksum_address(caller),
            "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(caller)),
            "gas": 250000,
            "gasPrice": web3.eth.gas_price,
        })
        logger.info("Prepared resume transaction", extra={"caller": caller})
        return transaction


__all__ = ["SystemPause"]
