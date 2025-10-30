from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Optional

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class StakeStatus:
    required: int
    current: int
    rewards_available: int
    is_slashed: bool


class BlockchainError(RuntimeError):
    pass


class MockLedger:
    """In-memory ledger used for tests and offline demos."""

    def __init__(self) -> None:
        self.stakes: Dict[str, int] = {}
        self.rewards: Dict[str, int] = {}
        self.paused: bool = False


class StakeManagerClient:
    def __init__(self, ledger: Optional[MockLedger] = None) -> None:
        self.ledger = ledger or MockLedger()

    def deposit(self, address: str, amount: int) -> str:
        logger.info("Depositing stake", extra={"context": {"address": address, "amount": amount}})
        self.ledger.stakes[address] = self.ledger.stakes.get(address, 0) + amount
        tx_hash = f"0x{abs(hash((address, amount))) % (10**64):064x}"
        return tx_hash

    def status(self, address: str, required: int) -> StakeStatus:
        current = self.ledger.stakes.get(address, 0)
        rewards = self.ledger.rewards.get(address, 0)
        return StakeStatus(required=required, current=current, rewards_available=rewards, is_slashed=current < required // 2)

    def claim_rewards(self, address: str) -> int:
        rewards = self.ledger.rewards.get(address, 0)
        self.ledger.rewards[address] = 0
        logger.info("Claimed rewards", extra={"context": {"address": address, "amount": rewards}})
        return rewards


class SystemPauseClient:
    def __init__(self, ledger: Optional[MockLedger] = None) -> None:
        self.ledger = ledger or MockLedger()

    def pause(self) -> None:
        logger.warning("System pause activated")
        self.ledger.paused = True

    def unpause(self) -> None:
        logger.info("System resumed")
        self.ledger.paused = False

    def is_paused(self) -> bool:
        return self.ledger.paused


class JobRegistryClient:
    def __init__(self) -> None:
        self._jobs: Dict[str, Dict[str, str]] = {}

    def register_job(self, job_id: str, payload: Dict[str, str]) -> None:
        self._jobs[job_id] = payload
        logger.debug("Registered job", extra={"context": payload})

    def fetch_available_jobs(self) -> Dict[str, Dict[str, str]]:
        return dict(self._jobs)

    def complete_job(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)
        logger.info("Completed job", extra={"context": {"job_id": job_id}})


__all__ = [
    "BlockchainError",
    "JobRegistryClient",
    "MockLedger",
    "StakeManagerClient",
    "StakeStatus",
    "SystemPauseClient",
]
