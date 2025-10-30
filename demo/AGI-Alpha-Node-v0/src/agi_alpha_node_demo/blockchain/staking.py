"""Stake management integration."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from web3 import Web3

from .client import BlockchainClient, MockBlockchainClient

LOGGER = logging.getLogger(__name__)


@dataclass
class StakeStatus:
    address: str
    staked_amount: Decimal
    minimum_required: Decimal

    @property
    def meets_threshold(self) -> bool:
        return self.staked_amount >= self.minimum_required

    def as_dict(self) -> dict[str, Any]:
        return {
            "address": self.address,
            "staked_amount": str(self.staked_amount),
            "minimum_required": str(self.minimum_required),
            "meets_threshold": self.meets_threshold,
        }


class StakeManager:
    """Interact with the StakeManager contract to assert staking requirements."""

    def __init__(self, client: BlockchainClient, minimum_required: Decimal) -> None:
        self._client = client
        self._minimum_required = minimum_required
        self._contract = None
        if not isinstance(client, MockBlockchainClient):
            self._contract = client.get_contract("stake_manager")

    def fetch_stake(self, address: str) -> Decimal:
        if isinstance(self._client, MockBlockchainClient):
            return Decimal(self._client.get_stake(address))
        assert self._contract is not None
        raw = self._client.call(self._contract, "stakeOf", Web3.to_checksum_address(address))
        return Decimal(raw)

    def ensure_minimum_stake(self, address: str) -> StakeStatus:
        staked = self.fetch_stake(address)
        status = StakeStatus(address=address, staked_amount=staked, minimum_required=self._minimum_required)
        if not status.meets_threshold:
            LOGGER.error(
                "Stake below required threshold: address=%s staked=%s minimum=%s",
                address,
                staked,
                self._minimum_required,
            )
            raise PermissionError("Insufficient stake to activate AGI Alpha Node")
        LOGGER.info("Stake verified: address=%s staked=%s", address, staked)
        return status
