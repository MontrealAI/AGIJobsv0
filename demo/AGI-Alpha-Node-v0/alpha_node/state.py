"""Thread-safe runtime state structures for the Alpha Node demo."""

from __future__ import annotations

import time
from dataclasses import dataclass
from threading import RLock
from typing import Dict, Optional


@dataclass(slots=True)
class GovernanceState:
    governance_address: str
    paused: bool = False


@dataclass(slots=True)
class EconomicState:
    staked_amount: int = 0
    rewards_accrued: int = 0
    slashed_amount: int = 0
    last_distribution_block: Optional[int] = None


@dataclass(slots=True)
class OperationalState:
    ens_verified: bool = False
    last_job_id: Optional[str] = None
    completed_jobs: int = 0
    failed_jobs: int = 0
    compliance_score: float = 0.0
    drills_completed: int = 0
    last_drill_timestamp: Optional[float] = None


class AlphaNodeState:
    """Thread-safe mutable state."""

    def __init__(self, governance_address: str) -> None:
        self._lock = RLock()
        self.governance = GovernanceState(governance_address=governance_address)
        self.economy = EconomicState()
        self.ops = OperationalState()
        self.custom_metrics: Dict[str, float] = {}

    def set_paused(self, value: bool) -> None:
        with self._lock:
            self.governance.paused = value

    def set_governance_address(self, address: str) -> None:
        with self._lock:
            self.governance.governance_address = address

    def update_stake(self, amount: int) -> None:
        with self._lock:
            self.economy.staked_amount = amount

    def accrue_rewards(self, amount: int) -> None:
        with self._lock:
            self.economy.rewards_accrued += amount

    def set_rewards(self, amount: int) -> None:
        with self._lock:
            self.economy.rewards_accrued = amount

    def register_completion(self, job_id: str, success: bool) -> None:
        with self._lock:
            self.ops.last_job_id = job_id
            if success:
                self.ops.completed_jobs += 1
            else:
                self.ops.failed_jobs += 1

    def set_slashed_amount(self, amount: int) -> None:
        with self._lock:
            self.economy.slashed_amount = amount

    def set_compliance(self, score: float) -> None:
        with self._lock:
            self.ops.compliance_score = score

    def set_ens_verified(self, verified: bool) -> None:
        with self._lock:
            self.ops.ens_verified = verified

    def record_drill(self) -> None:
        with self._lock:
            self.ops.drills_completed += 1
            self.ops.last_drill_timestamp = time.time()

    def snapshot(self) -> Dict[str, object]:
        with self._lock:
            return {
                "governance": {
                    "address": self.governance.governance_address,
                    "paused": self.governance.paused,
                },
                "economy": {
                    "staked_amount": self.economy.staked_amount,
                    "rewards_accrued": self.economy.rewards_accrued,
                    "slashed_amount": self.economy.slashed_amount,
                    "last_distribution_block": self.economy.last_distribution_block,
                },
                "operations": {
                    "ens_verified": self.ops.ens_verified,
                    "last_job_id": self.ops.last_job_id,
                    "completed_jobs": self.ops.completed_jobs,
                    "failed_jobs": self.ops.failed_jobs,
                    "compliance_score": self.ops.compliance_score,
                    "drills_completed": self.ops.drills_completed,
                    "last_drill_timestamp": self.ops.last_drill_timestamp,
                },
                "custom_metrics": dict(self.custom_metrics),
            }

    def set_metric(self, key: str, value: float) -> None:
        with self._lock:
            self.custom_metrics[key] = value


__all__ = ["AlphaNodeState"]
