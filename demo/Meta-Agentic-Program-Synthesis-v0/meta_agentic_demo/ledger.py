"""Simulated on-chain primitives for the demo."""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Dict, Iterable, List, Tuple

from .config import RewardPolicy, StakePolicy
from .entities import (
    AgentPerformance,
    Job,
    JobStatus,
    RewardBreakdown,
    RewardSummary,
)


@dataclass
class StakeAccount:
    """Tracks collateral for a solver or validator."""

    address: str
    balance: float
    last_active: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        self._amount(self.balance)

    @staticmethod
    def _amount(amount: float) -> None:
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not math.isfinite(amount) or amount < 0:
            raise ValueError("stake amount must be finite and non-negative")

    def slash(self, fraction: float) -> float:
        self._amount(fraction)
        if fraction > 1:
            raise ValueError("slash fraction must be within [0, 1]")
        penalty = self.balance * fraction
        self.balance -= penalty
        return penalty

    def deposit(self, amount: float) -> None:
        self._amount(amount)
        self._amount(self.balance + amount)
        self.balance += amount
        self.last_active = datetime.now(UTC)

    def withdraw(self, amount: float) -> float:
        self._amount(amount)
        if amount > self.balance:
            raise ValueError("withdrawal exceeds stake balance")
        self.balance -= amount
        self.last_active = datetime.now(UTC)
        return amount


class StakeManager:
    """Minimal stake accounting with inactivity enforcement."""

    def __init__(self, policy: StakePolicy) -> None:
        self.policy = policy
        self.accounts: Dict[str, StakeAccount] = {}

    def ensure_account(self, address: str) -> StakeAccount:
        account = self.accounts.get(address)
        if account is None:
            account = StakeAccount(address=address, balance=self.policy.minimum_stake)
            self.accounts[address] = account
        return account

    def touch(self, address: str) -> None:
        account = self.ensure_account(address)
        account.last_active = datetime.now(UTC)

    def slash(self, address: str, fraction: float | None = None) -> float:
        account = self.ensure_account(address)
        penalty = account.slash(self.policy.slash_fraction if fraction is None else fraction)
        return penalty

    def enforce_timeouts(self) -> Dict[str, float]:
        now = datetime.now(UTC)
        penalties: Dict[str, float] = {}
        for address, account in self.accounts.items():
            if now - account.last_active > self.policy.inactivity_timeout:
                penalties[address] = account.slash(self.policy.slash_fraction)
        return penalties


class RewardEngine:
    """Thermodynamic reward allocator based on agent energy consumption."""

    def __init__(self, policy: RewardPolicy) -> None:
        self.policy = policy

    def allocate(
        self,
        job: Job,
        solver_energy: Dict[str, float],
        validator_energy: Dict[str, float],
    ) -> RewardBreakdown:
        total_reward = self.policy.total_reward
        solver_weight = 1.0 - self.policy.validator_weight - self.policy.architect_weight
        solver_rewards = self._boltzmann_split(solver_energy, total_reward * solver_weight)
        validator_rewards = self._boltzmann_split(
            validator_energy, total_reward * self.policy.validator_weight
        )
        architect_reward = total_reward * self.policy.architect_weight
        return RewardBreakdown(
            job_id=job.job_id,
            total_reward=total_reward,
            solver_rewards=solver_rewards,
            validator_rewards=validator_rewards,
            architect_reward=architect_reward,
            solver_energy=solver_energy,
            validator_energy=validator_energy,
        )

    def _boltzmann_split(self, energy_map: Dict[str, float], pool: float) -> Dict[str, float]:
        if not energy_map:
            if pool:
                raise ValueError("a non-zero reward pool requires recipients")
            return {}
        for energy in energy_map.values():
            StakeAccount._amount(energy)
        max_energy = max(energy_map.values())
        if max_energy == 0:
            equal_share = pool / len(energy_map)
            return {address: equal_share for address in energy_map}
        numerator = {
            address: math.exp((energy / max_energy - 1) / self.policy.temperature)
            for address, energy in energy_map.items()
        }
        denominator = sum(numerator.values())
        if denominator == 0:
            equal_share = pool / len(energy_map)
            return {address: equal_share for address in energy_map}
        return {
            address: pool * value / denominator
            for address, value in numerator.items()
        }


class ValidationModule:
    """Commit–reveal validation with voting quorum enforcement."""

    def __init__(self, quorum: int = 3) -> None:
        if type(quorum) is not int or quorum < 1:
            raise ValueError("quorum must be a positive integer")
        self.quorum = quorum
        self._commits: Dict[int, Dict[str, str]] = defaultdict(dict)
        self._votes: Dict[int, Dict[str, Tuple[str, bool]]] = defaultdict(dict)

    def commit_result(self, job: Job, node: str, digest: str) -> None:
        if not node or not digest or digest != job.result_commit:
            raise ValueError("solver commitment must match the job result")
        if self._commits[job.job_id]:
            raise ValueError("solver commitment already recorded")
        job.assigned_node = node
        self._commits[job.job_id][node] = digest

    def submit_vote(self, job: Job, validator: str, digest: str, approve: bool) -> None:
        if not self._commits[job.job_id] or job.status is not JobStatus.IN_PROGRESS:
            raise ValueError("a pending committed result is required")
        if not validator or validator == job.assigned_node or validator in self._votes[job.job_id]:
            raise ValueError("validator must be distinct and vote once")
        if type(approve) is not bool:
            raise ValueError("approve must be a boolean")
        self._votes[job.job_id][validator] = (digest, approve)

    def finalise(self, job: Job) -> bool:
        if job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
            return job.status is JobStatus.COMPLETED
        if not job.result_commit or self._commits[job.job_id].get(job.assigned_node) != job.result_commit:
            job.status = JobStatus.FAILED
            return False
        votes = self._votes[job.job_id]
        if len(votes) < self.quorum:
            job.status = JobStatus.FAILED
            return False
        expected_digest = job.result_commit
        approvals = [
            approve
            for digest, approve in votes.values()
            if digest == expected_digest and approve
        ]
        if len(approvals) >= self.quorum:
            job.status = JobStatus.COMPLETED
            return True
        job.status = JobStatus.FAILED
        return False

    def reset(self, job_id: int) -> None:
        self._commits.pop(job_id, None)
        self._votes.pop(job_id, None)


def aggregate_performance(
    rewards: Iterable[RewardBreakdown],
    stake_manager: StakeManager,
) -> List[AgentPerformance]:
    """Produce telemetry structures summarising stake and energy changes."""

    performances: Dict[str, AgentPerformance] = {}
    for reward in rewards:
        for address, amount in reward.solver_rewards.items():
            account = stake_manager.ensure_account(address)
            stake_before = account.balance
            account.deposit(amount)
            entry = performances.get(address)
            if entry is None:
                entry = AgentPerformance(
                    address=address,
                    energy=reward.solver_energy.get(address, 0.0),
                    score=amount,
                    stake_before=stake_before,
                    stake_after=account.balance,
                )
                performances[address] = entry
            else:
                entry.score += amount
                entry.energy += reward.solver_energy.get(address, 0.0)
                entry.stake_after = account.balance
        for address, amount in reward.validator_rewards.items():
            account = stake_manager.ensure_account(address)
            stake_before = account.balance
            account.deposit(amount)
            entry = performances.get(address)
            if entry is None:
                entry = AgentPerformance(
                    address=address,
                    energy=reward.validator_energy.get(address, 0.0),
                    score=amount,
                    stake_before=stake_before,
                    stake_after=account.balance,
                )
                performances[address] = entry
            else:
                entry.score += amount
                entry.energy += reward.validator_energy.get(address, 0.0)
                entry.stake_after = account.balance
    return list(performances.values())


def summarise_rewards(rewards: Iterable[RewardBreakdown]) -> RewardSummary:
    """Aggregate reward totals and surface top contributors."""

    solver_totals: Dict[str, float] = defaultdict(float)
    validator_totals: Dict[str, float] = defaultdict(float)
    total_reward = 0.0
    architect_total = 0.0
    for breakdown in rewards:
        total_reward += breakdown.total_reward
        architect_total += breakdown.architect_reward
        for address, amount in breakdown.solver_rewards.items():
            solver_totals[address] += amount
        for address, amount in breakdown.validator_rewards.items():
            validator_totals[address] += amount
    solver_totals_dict = dict(solver_totals)
    validator_totals_dict = dict(validator_totals)
    top_solver = max(solver_totals_dict, key=solver_totals_dict.get) if solver_totals_dict else None
    top_validator = (
        max(validator_totals_dict, key=validator_totals_dict.get)
        if validator_totals_dict
        else None
    )
    return RewardSummary(
        total_reward=total_reward,
        architect_total=architect_total,
        solver_totals=solver_totals_dict,
        validator_totals=validator_totals_dict,
        top_solver=top_solver,
        top_validator=top_validator,
    )


__all__ = [
    "RewardEngine",
    "StakeManager",
    "ValidationModule",
    "aggregate_performance",
    "summarise_rewards",
]
