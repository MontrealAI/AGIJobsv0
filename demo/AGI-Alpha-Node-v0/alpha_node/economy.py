"""On-chain economy integration primitives."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, Iterable, List, Optional

from web3 import Web3

_LOGGER = logging.getLogger(__name__)


@dataclass
class StakeStatus:
    staked_wei: int
    min_stake_wei: int
    rewards_wei: int
    slashing_risk: bool
    last_checkpoint_block: Optional[int] = None

    @property
    def active(self) -> bool:
        return self.staked_wei >= self.min_stake_wei and not self.slashing_risk


@dataclass
class RewardTokenState:
    symbol: str
    address: str
    accrued: Decimal = Decimal("0")


class StakeManagerClient:
    """Client facade for StakeManager contract interactions."""

    def __init__(self, web3: Web3, address: str, min_stake_wei: int, reward_tokens: Iterable[Dict[str, str]]) -> None:
        self._web3 = web3
        self._address = Web3.to_checksum_address(address)
        self._min_stake_wei = min_stake_wei
        self._reward_tokens: List[RewardTokenState] = [
            RewardTokenState(symbol=token["symbol"], address=Web3.to_checksum_address(token["address"]))
            for token in reward_tokens
        ]
        self._staking_state = StakeStatus(staked_wei=0, min_stake_wei=min_stake_wei, rewards_wei=0, slashing_risk=False)

    def status(self) -> StakeStatus:
        return self._staking_state

    def deposit(self, amount_wei: int, tx_sender: str) -> StakeStatus:
        if amount_wei <= 0:
            raise ValueError("Stake deposit must be positive")
        tx_sender = Web3.to_checksum_address(tx_sender)
        self._staking_state.staked_wei += amount_wei
        self._staking_state.last_checkpoint_block = self._web3.eth.block_number
        _LOGGER.info(
            "Stake deposited",
            extra={
                "amount_wei": amount_wei,
                "total_stake": self._staking_state.staked_wei,
                "sender": tx_sender,
            },
        )
        return self._staking_state

    def accrue_rewards(self, amount_wei: int) -> StakeStatus:
        self._staking_state.rewards_wei += amount_wei
        self._staking_state.last_checkpoint_block = self._web3.eth.block_number
        _LOGGER.info("Rewards accrued", extra={"amount_wei": amount_wei})
        return self._staking_state

    def withdraw(self, amount_wei: int) -> StakeStatus:
        if amount_wei <= 0:
            raise ValueError("Stake withdrawal must be positive")
        self._staking_state.staked_wei = max(self._staking_state.staked_wei - amount_wei, 0)
        self._staking_state.last_checkpoint_block = self._web3.eth.block_number
        _LOGGER.info(
            "Stake withdrawn",
            extra={"amount_wei": amount_wei, "remaining_stake": self._staking_state.staked_wei},
        )
        return self._staking_state

    def claim_rewards(self, destination: str) -> List[RewardTokenState]:
        destination = Web3.to_checksum_address(destination)
        if self._staking_state.rewards_wei == 0:
            _LOGGER.debug("No rewards to claim")
            return self._reward_tokens
        per_token = Decimal(self._staking_state.rewards_wei) / max(len(self._reward_tokens), 1)
        for token in self._reward_tokens:
            token.accrued += per_token
        _LOGGER.info(
            "Rewards claimed",
            extra={
                "destination": destination,
                "per_token": str(per_token),
                "reward_tokens": [token.symbol for token in self._reward_tokens],
            },
        )
        self._staking_state.rewards_wei = 0
        return self._reward_tokens

    def flag_slashing(self, reason: str) -> StakeStatus:
        self._staking_state.slashing_risk = True
        _LOGGER.error("Slashing risk detected", extra={"reason": reason})
        return self._staking_state

    def clear_slashing(self) -> StakeStatus:
        self._staking_state.slashing_risk = False
        _LOGGER.info("Slashing risk cleared")
        return self._staking_state
