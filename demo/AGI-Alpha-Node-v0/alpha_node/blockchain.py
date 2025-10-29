"""Blockchain interaction layer for the Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from .logging_utils import get_logger

LOGGER = get_logger(__name__)


@dataclass(slots=True)
class StakeStatus:
    staked_amount: int
    required_amount: int
    slashed_amount: int
    active: bool


@dataclass(slots=True)
class RewardSnapshot:
    unclaimed_rewards: int
    last_claim_block: Optional[int]


class BlockchainInteractor:
    """Thin wrapper around blockchain primitives.

    The interactor is designed so it can be replaced with a production-grade
    implementation backed by ``web3`` or ``ethers``.  For the demo we maintain a
    deterministic in-memory ledger that mimics stake, reward, and governance
    flows while providing full observability for audits.
    """

    def __init__(
        self,
        job_registry_address: str,
        stake_manager_address: str,
        incentives_address: str,
        treasury_address: str,
        required_stake: int,
    ) -> None:
        self.job_registry_address = job_registry_address
        self.stake_manager_address = stake_manager_address
        self.incentives_address = incentives_address
        self.treasury_address = treasury_address
        self.required_stake = required_stake
        self._stake_ledger: Dict[str, int] = {}
        self._reward_ledger: Dict[str, int] = {}
        self._slash_ledger: Dict[str, int] = {}
        LOGGER.debug(
            "BlockchainInteractor initialized | job_registry=%s stake_manager=%s",
            job_registry_address,
            stake_manager_address,
        )

    def stake(self, operator: str, amount: int) -> StakeStatus:
        current = self._stake_ledger.get(operator, 0) + amount
        self._stake_ledger[operator] = current
        LOGGER.info("Stake updated | operator=%s amount=%s", operator, current)
        return self._status(operator)

    def withdraw(self, operator: str, amount: int) -> StakeStatus:
        current = max(self._stake_ledger.get(operator, 0) - amount, 0)
        self._stake_ledger[operator] = current
        LOGGER.info("Stake withdrawn | operator=%s amount=%s", operator, current)
        return self._status(operator)

    def grant_rewards(self, operator: str, amount: int) -> RewardSnapshot:
        rewards = self._reward_ledger.get(operator, 0) + amount
        self._reward_ledger[operator] = rewards
        LOGGER.info("Rewards granted | operator=%s amount=%s", operator, rewards)
        return RewardSnapshot(unclaimed_rewards=rewards, last_claim_block=None)

    def claim_rewards(self, operator: str) -> RewardSnapshot:
        rewards = self._reward_ledger.get(operator, 0)
        if rewards <= 0:
            return RewardSnapshot(unclaimed_rewards=0, last_claim_block=None)
        LOGGER.info("Rewards claimed | operator=%s claimed=%s", operator, rewards)
        self._reward_ledger[operator] = 0
        return RewardSnapshot(unclaimed_rewards=0, last_claim_block=0)

    def slash(self, operator: str, amount: int) -> StakeStatus:
        stake = self._stake_ledger.get(operator, 0)
        slashed = min(amount, stake)
        self._stake_ledger[operator] = stake - slashed
        self._slash_ledger[operator] = self._slash_ledger.get(operator, 0) + slashed
        LOGGER.warning("Stake slashed | operator=%s amount=%s", operator, slashed)
        return self._status(operator)

    def status(self, operator: str) -> StakeStatus:
        return self._status(operator)

    def _status(self, operator: str) -> StakeStatus:
        current = self._stake_ledger.get(operator, 0)
        slashed = self._slash_ledger.get(operator, 0)
        active = current >= self.required_stake
        return StakeStatus(
            staked_amount=current,
            required_amount=self.required_stake,
            slashed_amount=slashed,
            active=active,
        )


__all__ = ["BlockchainInteractor", "StakeStatus", "RewardSnapshot"]
