"""Simulated on-chain primitives for the demo."""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Dict, Iterable, List, Tuple

from .config import RewardPolicy, StakePolicy
from .entities import AgentPerformance, Job, JobStatus, RewardBreakdown


@dataclass
class StakeAccount:
    """Tracks collateral for a solver or validator."""

    address: str
    balance: float
    last_active: datetime = field(default_factory=lambda: datetime.now(UTC))

    def slash(self, fraction: float) -> float:
        penalty = self.balance * fraction
        self.balance -= penalty
        return penalty

    def deposit(self, amount: float) -> None:
        self.balance += amount
        self.last_active = datetime.now(UTC)

    def withdraw(self, amount: float) -> float:
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
        penalty = account.slash(fraction or self.policy.slash_fraction)
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
            return {}
        max_energy = max(energy_map.values())
        if max_energy == 0:
            equal_share = pool / len(energy_map)
            return {address: equal_share for address in energy_map}
        numerator = {
            address: math.exp(energy / (self.policy.temperature * max_energy))
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
        self.quorum = quorum
        self._commits: Dict[int, Dict[str, str]] = defaultdict(dict)
        self._votes: Dict[int, Dict[str, Tuple[str, bool]]] = defaultdict(dict)

    def commit_result(self, job: Job, node: str, digest: str) -> None:
        self._commits[job.job_id][node] = digest

    def submit_vote(self, job: Job, validator: str, digest: str, approve: bool) -> None:
        self._votes[job.job_id][validator] = (digest, approve)

    def finalise(self, job: Job) -> bool:
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
