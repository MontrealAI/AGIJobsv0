"""Planetary resource and token economy management."""

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


@dataclass
class ResourceSnapshot:
    energy_available: float
    compute_available: float
    token_price_per_energy: float
    token_price_per_compute: float


class ResourceManager:
    """Track planetary resources and manage tokenized incentives."""

    def __init__(self, energy_capacity: float, compute_capacity: float, base_token_supply: float) -> None:
        self.energy_capacity = energy_capacity
        self.compute_capacity = compute_capacity
        self._energy_available = energy_capacity
        self._compute_available = compute_capacity
        self.accounts: Dict[str, AgentAccount] = {}
        self._token_velocity: float = 1.0
        self._base_token_supply = base_token_supply

    def ensure_account(self, agent: str, initial_tokens: float = 0.0) -> AgentAccount:
        account = self.accounts.get(agent)
        if account is None:
            account = AgentAccount(name=agent, tokens=initial_tokens)
            self.accounts[agent] = account
        return account

    def snapshot(self) -> ResourceSnapshot:
        token_price_energy = max(0.01, (self._base_token_supply / max(self._energy_available, 1.0)) * self._token_velocity)
        token_price_compute = max(0.01, (self._base_token_supply / max(self._compute_available, 1.0)) * self._token_velocity)
        return ResourceSnapshot(
            energy_available=self._energy_available,
            compute_available=self._compute_available,
            token_price_per_energy=token_price_energy,
            token_price_per_compute=token_price_compute,
        )

    def allocate_resources(self, agent: str, energy: float, compute: float) -> Tuple[float, float]:
        if energy > self._energy_available or compute > self._compute_available:
            raise ValueError("Insufficient planetary resources")
        snapshot = self.snapshot()
        cost = energy * snapshot.token_price_per_energy + compute * snapshot.token_price_per_compute
        account = self.ensure_account(agent)
        if account.tokens - account.locked < cost:
            raise ValueError("Insufficient tokens for allocation")
        account.tokens -= cost
        self._energy_available -= energy
        self._compute_available -= compute
        account.energy_quota += energy
        account.compute_quota += compute
        self._token_velocity = min(5.0, self._token_velocity * 1.01)
        return cost, snapshot.token_price_per_energy

    def release_resources(self, agent: str, energy: float, compute: float) -> None:
        account = self.ensure_account(agent)
        account.energy_quota = max(0.0, account.energy_quota - energy)
        account.compute_quota = max(0.0, account.compute_quota - compute)
        self._energy_available = min(self.energy_capacity, self._energy_available + energy)
        self._compute_available = min(self.compute_capacity, self._compute_available + compute)
        self._token_velocity = max(0.5, self._token_velocity * 0.995)

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

    def unlock_stake(self, agent: str, amount: float) -> None:
        account = self.ensure_account(agent)
        account.locked = max(0.0, account.locked - amount)
        account.tokens += amount

    def slash(self, agent: str, amount: float) -> None:
        account = self.ensure_account(agent)
        account.locked = max(0.0, account.locked - amount)

    def rebalance_supply(self, minted_tokens: float) -> None:
        self._base_token_supply += minted_tokens
        self._token_velocity = max(0.5, min(5.0, self._token_velocity * 0.97))
