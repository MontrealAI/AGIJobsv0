"""Interactions with the StakeManager and reward distribution contracts."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Optional

from eth_typing import HexStr
from web3 import Web3
from web3.contract import Contract

from .client import Web3Config, get_web3

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class StakingState:
    staked_amount: int
    rewards_earned: int
    slash_risk: bool
    last_update_block: int


@dataclass(slots=True)
class StakingManager:
    config: Web3Config
    contract_address: str
    abi: list

    def _contract(self) -> Contract:
        web3 = get_web3(self.config)
        return web3.eth.contract(address=Web3.to_checksum_address(self.contract_address), abi=self.abi)

    def fetch_state(self, operator: str) -> StakingState:
        contract = self._contract()
        raw_state = contract.functions.getOperator(operator).call()
        logger.debug("Fetched staking state", extra={"operator": operator, "raw": raw_state})
        return StakingState(
            staked_amount=int(raw_state["stakedAmount"]),
            rewards_earned=int(raw_state["rewards"]),
            slash_risk=bool(raw_state["slashRisk"]),
            last_update_block=int(raw_state["lastUpdateBlock"]),
        )

    def ensure_minimum_stake(self, operator: str, minimum: int) -> None:
        state = self.fetch_state(operator)
        if state.staked_amount < minimum:
            raise RuntimeError(
                f"Operator stake below minimum: {state.staked_amount} < {minimum}"
            )

    def build_stake_tx(self, operator: str, amount: int) -> Dict[str, HexStr]:
        contract = self._contract()
        web3 = get_web3(self.config)
        transaction = contract.functions.depositStake(amount).build_transaction({
            "from": Web3.to_checksum_address(operator),
            "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(operator)),
            "gas": 500000,
            "gasPrice": web3.eth.gas_price,
        })
        logger.info("Prepared stake transaction", extra={"operator": operator, "amount": amount})
        return transaction

    def build_claim_rewards_tx(self, operator: str) -> Dict[str, HexStr]:
        contract = self._contract()
        web3 = get_web3(self.config)
        transaction = contract.functions.claimRewards().build_transaction({
            "from": Web3.to_checksum_address(operator),
            "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(operator)),
            "gas": 400000,
            "gasPrice": web3.eth.gas_price,
        })
        logger.info("Prepared claim rewards transaction", extra={"operator": operator})
        return transaction

    def monitor_slashing(self, operator: str) -> bool:
        state = self.fetch_state(operator)
        if state.slash_risk:
            logger.warning("Operator is flagged for slashing risk", extra={"operator": operator})
        return state.slash_risk


@dataclass(slots=True)
class FeePool:
    config: Web3Config
    contract_address: str
    abi: list

    def _contract(self) -> Contract:
        web3 = get_web3(self.config)
        return web3.eth.contract(address=Web3.to_checksum_address(self.contract_address), abi=self.abi)

    def rewards_available(self) -> int:
        contract = self._contract()
        rewards = int(contract.functions.rewardsAvailable().call())
        logger.debug("Queried rewards available", extra={"rewards": rewards})
        return rewards

    def build_withdraw_tx(self, operator: str, amount: int) -> Dict[str, HexStr]:
        contract = self._contract()
        web3 = get_web3(self.config)
        transaction = contract.functions.withdraw(amount).build_transaction({
            "from": Web3.to_checksum_address(operator),
            "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(operator)),
            "gas": 300000,
            "gasPrice": web3.eth.gas_price,
        })
        logger.info("Prepared fee pool withdrawal", extra={"operator": operator, "amount": amount})
        return transaction


__all__ = ["StakingManager", "StakingState", "FeePool"]
