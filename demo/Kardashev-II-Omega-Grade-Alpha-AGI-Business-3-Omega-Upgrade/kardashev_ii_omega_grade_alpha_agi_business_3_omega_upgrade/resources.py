"""Planetary resource ledger with adaptive pricing and staking."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple


@dataclass
class AgentAccount:
    name: str
    tokens: float
    locked: float = 0.0
    energy_quota: float = 0.0
    compute_quota: float = 0.0
    reputation: float = 1.0


@dataclass
class ResourceSnapshot:
    energy_available: float
    compute_available: float
    token_price_per_energy: float
    token_price_per_compute: float
    treasury: float


class ResourceManager:
    """Tracks planetary energy/compute balances and token economics."""

    def __init__(self, energy_capacity: float, compute_capacity: float, base_token_supply: float) -> None:
        self.energy_capacity = energy_capacity
        self.compute_capacity = compute_capacity
        self._energy_available = energy_capacity
        self._compute_available = compute_capacity
        self._treasury = base_token_supply
        self.accounts: Dict[str, AgentAccount] = {}
        self._token_velocity = 1.0
        self._price_floor = 0.01

    def ensure_account(self, agent: str, initial_tokens: float = 0.0) -> AgentAccount:
        account = self.accounts.get(agent)
        if account is None:
            account = AgentAccount(name=agent, tokens=initial_tokens)
            self.accounts[agent] = account
        return account

    def snapshot(self) -> ResourceSnapshot:
        price_energy = max(self._price_floor, (self._treasury / max(self._energy_available, 1.0)) * self._token_velocity)
        price_compute = max(self._price_floor, (self._treasury / max(self._compute_available, 1.0)) * (self._token_velocity * 0.85))
        return ResourceSnapshot(
            energy_available=self._energy_available,
            compute_available=self._compute_available,
            token_price_per_energy=price_energy,
            token_price_per_compute=price_compute,
            treasury=self._treasury,
        )

    def allocate_resources(self, agent: str, energy: float, compute: float) -> Tuple[float, float]:
        if energy > self._energy_available or compute > self._compute_available:
            raise ValueError("Insufficient planetary resources")
        snapshot = self.snapshot()
        cost = energy * snapshot.token_price_per_energy + compute * snapshot.token_price_per_compute
        account = self.ensure_account(agent)
        liquid = account.tokens - account.locked
        if liquid < cost:
            raise ValueError("Insufficient tokens for allocation")
        account.tokens -= cost
        account.energy_quota += energy
        account.compute_quota += compute
        self._energy_available -= energy
        self._compute_available -= compute
        self._token_velocity = min(8.0, self._token_velocity * 1.015)
        self._treasury += cost * 0.02
        return cost, snapshot.token_price_per_energy

    def release_resources(self, agent: str, energy: float, compute: float) -> None:
        account = self.ensure_account(agent)
        account.energy_quota = max(0.0, account.energy_quota - energy)
        account.compute_quota = max(0.0, account.compute_quota - compute)
        self._energy_available = min(self.energy_capacity, self._energy_available + energy)
        self._compute_available = min(self.compute_capacity, self._compute_available + compute)
        self._token_velocity = max(0.4, self._token_velocity * 0.99)

    def credit_tokens(self, agent: str, amount: float) -> None:
        account = self.ensure_account(agent)
        account.tokens += amount

    def debit_tokens(self, agent: str, amount: float) -> None:
        account = self.ensure_account(agent)
        if account.tokens - account.locked < amount:
            raise ValueError("Insufficient balance")
        account.tokens -= amount

    def lock_stake(self, agent: str, amount: float) -> None:
        account = self.ensure_account(agent)
        if account.tokens < amount:
            raise ValueError("Insufficient tokens to stake")
        account.tokens -= amount
        account.locked += amount
        account.reputation = min(5.0, account.reputation + amount / 1_000_000)

    def unlock_stake(self, agent: str, amount: float) -> None:
        account = self.ensure_account(agent)
        account.locked = max(0.0, account.locked - amount)
        account.tokens += amount

    def slash(self, agent: str, amount: float) -> None:
        account = self.ensure_account(agent)
        penalty = min(account.locked, amount)
        account.locked -= penalty
        self._treasury += penalty * 0.5
        account.reputation = max(0.1, account.reputation * 0.8)

    def rebalance_supply(self, mint: float) -> None:
        self._treasury += mint
        self._token_velocity = max(0.35, min(9.0, self._token_velocity * 0.97))

    def energy_feedback(self, additional_energy: float) -> None:
        self._energy_available = min(self.energy_capacity, self._energy_available + additional_energy)
        self._token_velocity = max(0.5, self._token_velocity * 0.985)

    def compute_feedback(self, additional_compute: float) -> None:
        self._compute_available = min(self.compute_capacity, self._compute_available + additional_compute)
        self._token_velocity = max(0.5, self._token_velocity * 0.985)

    def snapshot_accounts(self) -> Dict[str, Dict[str, float]]:
        return {
            name: {
                "tokens": account.tokens,
                "locked": account.locked,
                "energy_quota": account.energy_quota,
                "compute_quota": account.compute_quota,
                "reputation": account.reputation,
            }
            for name, account in self.accounts.items()
        }
