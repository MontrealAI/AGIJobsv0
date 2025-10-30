"""Governance, pause, and ownership transfer utilities."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict

from .client import BlockchainClient, MockBlockchainClient

LOGGER = logging.getLogger(__name__)


@dataclass
class PauseStatus:
    contract: str
    paused: bool

    def as_dict(self) -> Dict[str, Any]:
        return {"contract": self.contract, "paused": self.paused}


class SystemPauseController:
    """Interface with the SystemPause contract to halt or resume operations."""

    def __init__(self, client: BlockchainClient, contract_name: str = "system_pause_contract") -> None:
        self._client = client
        self._contract_name = contract_name
        self._contract = None
        if not isinstance(client, MockBlockchainClient):
            contract_cfg = client.config.contracts.get("system_pause")
            if contract_cfg is None:
                raise KeyError("system_pause contract configuration missing")
            self._contract = client.get_contract_from_config(contract_cfg)

    def status(self) -> PauseStatus:
        if isinstance(self._client, MockBlockchainClient):
            return PauseStatus(contract=self._contract_name, paused=self._client.is_paused())
        assert self._contract is not None
        paused = bool(self._contract.functions.paused().call())  # pragma: no cover
        return PauseStatus(contract=self._contract.address, paused=paused)

    def pause_all(self, sender: str) -> str:
        LOGGER.warning("Pausing all operations via SystemPause")
        if isinstance(self._client, MockBlockchainClient):
            self._client.set_paused(True)
            return "mock-pause"
        assert self._contract is not None
        return self._client.transact(self._contract, "pauseAll", {"from": sender})

    def unpause_all(self, sender: str) -> str:
        LOGGER.warning("Resuming operations via SystemPause")
        if isinstance(self._client, MockBlockchainClient):
            self._client.set_paused(False)
            return "mock-unpause"
        assert self._contract is not None
        return self._client.transact(self._contract, "unpauseAll", {"from": sender})


class GovernanceController:
    """Automate governance address updates across contracts."""

    def __init__(self, client: BlockchainClient) -> None:
        self._client = client

    def transfer_governance(self, new_address: str) -> Dict[str, Any]:
        LOGGER.info("Transferring governance to %s", new_address)
        if isinstance(self._client, MockBlockchainClient):
            return {"status": "mock", "address": new_address}
        results = {}
        for name, contract_config in self._client.config.contracts.items():
            contract = self._client.get_contract(name)
            try:
                tx_hash = self._client.transact(contract, "transferOwnership", {"from": new_address}, new_address)
                results[name] = tx_hash
            except Exception as exc:  # pragma: no cover - depends on ABI support
                LOGGER.error("Failed to transfer governance for %s: %s", name, exc)
                results[name] = str(exc)
        return results
