"""Resource and token accounting for the Omega-grade demo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class ResourceSnapshot:
    energy_available: float
    compute_available: float
    token_supply: float


@dataclass
class Account:
    name: str
    tokens: float = 0.0
    locked: float = 0.0
    energy_quota: float = 0.0
    compute_quota: float = 0.0

    def ensure_budget(self, tokens: float) -> None:
        if self.tokens < tokens:
            raise ValueError(f"Account {self.name} lacks {tokens} tokens; balance={self.tokens}")


class ResourceManager:
    """Planetary resource controller with dynamic incentives."""

    def __init__(self, energy_capacity: float, compute_capacity: float, base_token_supply: float) -> None:
        self._base_energy_capacity = energy_capacity
        self._base_compute_capacity = compute_capacity
        self.energy_available = energy_capacity
        self.compute_available = compute_capacity
        self.token_supply = base_token_supply
        self._accounts: Dict[str, Account] = {}
        self.compute_price = 1.0
        self.energy_price = 1.0

    def ensure_account(self, name: str, initial_tokens: float = 0.0) -> Account:
        account = self._accounts.get(name)
        if account is None:
            account = Account(
                name=name,
                tokens=initial_tokens,
                energy_quota=self.energy_available,
                compute_quota=self.compute_available,
            )
            self._accounts[name] = account
        else:
            account.tokens = max(account.tokens, initial_tokens)
        return account

    def debit_tokens(self, name: str, amount: float) -> None:
        account = self.ensure_account(name)
        account.ensure_budget(amount)
        account.tokens -= amount
        self.token_supply -= amount

    def credit_tokens(self, name: str, amount: float) -> None:
        account = self.ensure_account(name)
        account.tokens += amount
        self.token_supply += amount

    def lock_stake(self, name: str, amount: float) -> None:
        account = self.ensure_account(name)
        account.ensure_budget(amount)
        account.tokens -= amount
        account.locked += amount

    def release_stake(self, name: str, amount: float) -> None:
        account = self.ensure_account(name)
        account.locked -= amount
        account.tokens += amount

    def slash(self, name: str, amount: float) -> None:
        account = self.ensure_account(name)
        account.locked = max(0.0, account.locked - amount)
        self.token_supply -= amount

    def record_usage(self, name: str, energy: float, compute: float) -> None:
        account = self.ensure_account(name)
        if energy > self.energy_available or compute > self.compute_available:
            raise ValueError("Insufficient planetary resources for request")
        self.energy_available -= energy
        self.compute_available -= compute
        account.energy_quota += energy
        account.compute_quota += compute
        self._rebalance_prices()

    def snapshot(self) -> ResourceSnapshot:
        return ResourceSnapshot(
            energy_available=self.energy_available,
            compute_available=self.compute_available,
            token_supply=self.token_supply,
        )

    def to_serializable(self) -> Dict[str, Dict[str, float]]:
        return {
            name: {
                "tokens": account.tokens,
                "locked": account.locked,
                "energy_quota": account.energy_quota,
                "compute_quota": account.compute_quota,
            }
            for name, account in self._accounts.items()
        }

    def _rebalance_prices(self) -> None:
        # Basic scarcity pricing to discourage exhaustion.
        compute_ratio = self.compute_available / max(self._base_compute_capacity, 1.0)
        energy_ratio = self.energy_available / max(self._base_energy_capacity, 1.0)
        self.compute_price = 1.0 + max(0.0, 1.0 - compute_ratio)
        self.energy_price = 1.0 + max(0.0, 1.0 - energy_ratio)

