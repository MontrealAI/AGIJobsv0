from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

from .config import Config
from .logging_utils import json_log


@dataclass
class BlockchainState:
    ens_registry: Dict[str, str] = field(default_factory=dict)
    stakes: Dict[str, float] = field(default_factory=dict)
    rewards: Dict[str, float] = field(default_factory=dict)
    governance_address: Optional[str] = None
    paused: bool = False


class BlockchainClient:
    """In-memory blockchain simulator for the demo.

    The implementation intentionally mirrors expected contract interactions so the
    same interface can later be wired to real web3 calls.
    """

    def __init__(self, config: Config, state: Optional[BlockchainState] = None) -> None:
        self.config = config
        self.state = state or BlockchainState()
        self._lock = threading.Lock()
        self.state.ens_registry.setdefault(config.operator.ens_domain, config.operator.operator_address)
        self.state.stakes.setdefault(config.operator.operator_address, float(config.staking.minimum_stake))
        self.state.governance_address = self.state.governance_address or config.operator.governance_address
        json_log("blockchain_init", ens_domain=config.operator.ens_domain, operator=config.operator.operator_address)

    # Identity & Governance -------------------------------------------------
    def verify_ens_domain(self) -> bool:
        owner = self.state.ens_registry.get(self.config.operator.ens_domain)
        verified = owner is not None and owner.lower() == self.config.operator.operator_address.lower()
        json_log("ens_verification", domain=self.config.operator.ens_domain, owner=owner, verified=verified)
        return verified

    def transfer_governance(self, new_address: str) -> None:
        with self._lock:
            old = self.state.governance_address
            self.state.governance_address = new_address
        json_log("governance_transfer", old=old, new=new_address)

    def get_governance_address(self) -> str:
        return self.state.governance_address or self.config.operator.governance_address

    def pause(self, reason: str) -> None:
        with self._lock:
            self.state.paused = True
        json_log("system_paused", reason=reason)

    def resume(self) -> None:
        with self._lock:
            self.state.paused = False
        json_log("system_resumed")

    def is_paused(self) -> bool:
        return self.state.paused

    # Economy ---------------------------------------------------------------
    def get_stake(self, address: Optional[str] = None) -> float:
        address = address or self.config.operator.operator_address
        return self.state.stakes.get(address, 0.0)

    def ensure_minimum_stake(self) -> bool:
        stake = self.get_stake()
        meets_requirement = stake >= float(self.config.staking.minimum_stake)
        json_log("stake_check", stake=stake, minimum=float(self.config.staking.minimum_stake))
        return meets_requirement

    def deposit_stake(self, amount: float) -> float:
        with self._lock:
            self.state.stakes[self.config.operator.operator_address] = self.get_stake() + amount
        json_log("stake_deposit", amount=amount, new_balance=self.get_stake())
        return self.get_stake()

    def accrue_rewards(self, amount: float) -> None:
        with self._lock:
            rewards = self.state.rewards.get(self.config.operator.operator_address, 0.0) + amount
            self.state.rewards[self.config.operator.operator_address] = rewards
        json_log("rewards_accrued", amount=amount, total=rewards)

    def claim_rewards(self) -> float:
        with self._lock:
            rewards = self.state.rewards.pop(self.config.operator.operator_address, 0.0)
            if self.config.staking.auto_reinvest and rewards:
                self.deposit_stake(rewards)
        json_log("rewards_claimed", amount=rewards)
        return rewards

    # Jobs ------------------------------------------------------------------
    def list_available_jobs(self) -> List[Dict[str, str]]:
        # Deterministic placeholder jobs for demo/test purposes
        jobs = [
            {"job_id": "FIN-001", "domain": "finance", "reward": 1250.0},
            {"job_id": "BIO-002", "domain": "biotech", "reward": 1750.0},
            {"job_id": "MAN-003", "domain": "manufacturing", "reward": 840.0},
        ]
        json_log("jobs_listed", count=len(jobs))
        return jobs

    def record_job_completion(self, job_id: str, reward: float, notes: str) -> None:
        self.accrue_rewards(reward)
        json_log("job_completed", job_id=job_id, reward=reward, notes=notes)

    # Identity Registry ----------------------------------------------------
    def register_identity(self) -> None:
        json_log("identity_registered", domain=self.config.operator.ens_domain)

    def verify_identity_prerequisites(self) -> bool:
        meets = self.ensure_minimum_stake() and self.verify_ens_domain()
        json_log("identity_prerequisites", meets=meets)
        return meets

    # Diagnostics ----------------------------------------------------------
    def export_state(self) -> Dict[str, object]:
        return {
            "ens_registry": dict(self.state.ens_registry),
            "stakes": dict(self.state.stakes),
            "rewards": dict(self.state.rewards),
            "governance_address": self.state.governance_address,
            "paused": self.state.paused,
        }

    def simulate_slash(self, percentage: float) -> float:
        with self._lock:
            current = self.get_stake()
            slash_amount = current * percentage
            new_value = max(0.0, current - slash_amount)
            self.state.stakes[self.config.operator.operator_address] = new_value
        json_log("stake_slashed", percentage=percentage, new_balance=new_value)
        return new_value

    def simulate_ens_revocation(self) -> None:
        with self._lock:
            self.state.ens_registry[self.config.operator.ens_domain] = "0x0000000000000000000000000000000000000000"
        json_log("ens_revoked", domain=self.config.operator.ens_domain)

    def record_jobs_batch(self, job_ids: Iterable[str]) -> None:
        json_log("jobs_batch_recorded", job_ids=list(job_ids))

    def load_state(self, snapshot: Dict[str, object]) -> None:
        with self._lock:
            self.state.ens_registry = dict(snapshot.get("ens_registry", {}))
            self.state.stakes = dict(snapshot.get("stakes", {}))
            self.state.rewards = dict(snapshot.get("rewards", {}))
            self.state.governance_address = snapshot.get("governance_address")
            self.state.paused = bool(snapshot.get("paused", False))
        json_log("blockchain_state_restored")
