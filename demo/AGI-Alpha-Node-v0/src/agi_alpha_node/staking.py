"""$AGIALPHA staking integration layer."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from tenacity import retry, stop_after_attempt, wait_exponential
from web3 import Web3

from .config import StakingConfig

LOGGER = logging.getLogger("agi_alpha_node")


@dataclass
class StakeStatus:
    staked_amount: int
    minimum_required: int
    rewards_available: int

    @property
    def is_active(self) -> bool:
        return self.staked_amount >= self.minimum_required


class StakeManagerClient:
    """High-level staking client with retry & pause hooks."""

    def __init__(self, config: StakingConfig, provider: Optional[Web3] = None):
        self.config = config
        self._web3 = provider

    def attach_web3(self, web3: Web3) -> None:
        self._web3 = web3

    def current_status(self) -> StakeStatus:
        LOGGER.debug("Fetching staking status", extra={"event": "staking_status"})
        # For demo purposes, mock data is returned when web3 is unavailable.
        if not self._web3:
            return StakeStatus(self.config.minimum_stake + 1, self.config.minimum_stake, 250)
        contract = self._web3.eth.contract(address=self.config.stake_manager_address)
        staked = contract.functions.stakedBalance().call()  # type: ignore[attr-defined]
        rewards = contract.functions.pendingRewards().call()  # type: ignore[attr-defined]
        return StakeStatus(int(staked), self.config.minimum_stake, int(rewards))

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    def deposit(self, amount: int) -> None:
        if not self._web3:
            LOGGER.info(
                "Simulated stake deposit", extra={"event": "stake_deposit", "data": {"amount": amount}}
            )
            return
        contract = self._web3.eth.contract(address=self.config.stake_manager_address)
        tx_hash = contract.functions.deposit(amount).transact()  # type: ignore[attr-defined]
        LOGGER.info(
            "Stake deposit submitted",
            extra={"event": "stake_deposit", "data": {"amount": amount, "tx": tx_hash.hex()}},
        )

    def claim_rewards(self) -> int:
        status = self.current_status()
        if status.rewards_available <= 0:
            LOGGER.info("No rewards available", extra={"event": "stake_no_rewards"})
            return 0
        if not self._web3:
            LOGGER.info(
                "Simulated reward claim",
                extra={"event": "stake_claim", "data": {"amount": status.rewards_available}},
            )
            return status.rewards_available
        contract = self._web3.eth.contract(address=self.config.stake_manager_address)
        tx_hash = contract.functions.claimRewards().transact()  # type: ignore[attr-defined]
        LOGGER.info(
            "Rewards claimed",
            extra={"event": "stake_claim", "data": {"amount": status.rewards_available, "tx": tx_hash.hex()}},
        )
        return status.rewards_available


__all__ = ["StakeManagerClient", "StakeStatus"]
