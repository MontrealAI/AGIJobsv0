from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Tuple


@dataclass
class Account:
    tokens: float
    staked: float = 0.0
    energy_allowance: float = 0.0
    compute_allowance: float = 0.0
    energy_used: float = 0.0
    compute_used: float = 0.0

    def allocate(self, energy: float, compute: float) -> None:
        if self.energy_used + energy > self.energy_allowance:
            raise ValueError("energy allowance exceeded")
        if self.compute_used + compute > self.compute_allowance:
            raise ValueError("compute allowance exceeded")
        self.energy_used += energy
        self.compute_used += compute

    def release(self, energy: float, compute: float) -> None:
        self.energy_used = max(0.0, self.energy_used - energy)
        self.compute_used = max(0.0, self.compute_used - compute)

    def available_tokens(self) -> float:
        return self.tokens - self.staked


@dataclass
class ResourceManager:
    planetary_energy_gw: float
    planetary_compute_pf: float
    token_supply: float
    token_per_energy: float
    token_per_compute: float
    dynamic_inflation_threshold: float
    scarcity_multiplier: float
    accounts: Dict[str, Account] = field(default_factory=dict)

    def register(self, name: str, tokens: float, energy_allowance: float, compute_allowance: float) -> None:
        self.accounts[name] = Account(tokens=tokens, energy_allowance=energy_allowance, compute_allowance=compute_allowance)

    def request_allocation(self, name: str, energy: float, compute: float) -> Tuple[float, float]:
        account = self.accounts[name]
        if energy > self.planetary_energy_gw:
            raise ValueError("planetary energy exhausted")
        if compute > self.planetary_compute_pf:
            raise ValueError("planetary compute exhausted")
        price_energy = energy * self.token_per_energy
        price_compute = compute * self.token_per_compute
        total_price = price_energy + price_compute
        if account.available_tokens() < total_price:
            raise ValueError("insufficient tokens for allocation")
        account.tokens -= total_price
        account.allocate(energy, compute)
        self.planetary_energy_gw -= energy
        self.planetary_compute_pf -= compute
        return price_energy, price_compute

    def release_allocation(self, name: str, energy: float, compute: float) -> None:
        account = self.accounts[name]
        account.release(energy, compute)
        self.planetary_energy_gw += energy
        self.planetary_compute_pf += compute

    def stake(self, name: str, amount: float) -> None:
        account = self.accounts[name]
        if account.available_tokens() < amount:
            raise ValueError("insufficient tokens to stake")
        account.tokens -= amount
        account.staked += amount

    def release_stake(self, name: str, amount: float) -> None:
        account = self.accounts[name]
        account.staked = max(0.0, account.staked - amount)
        account.tokens += amount

    def slash(self, name: str, amount: float) -> None:
        account = self.accounts[name]
        penalty = min(account.staked, amount)
        account.staked -= penalty
        self.token_supply -= penalty

    def reward(self, recipient: str, amount: float) -> None:
        account = self.accounts[recipient]
        account.tokens += amount
        self.token_supply = max(0.0, self.token_supply - amount * 0.02)

    def rebalance_pricing(self) -> None:
        total_energy_used = sum(acc.energy_used for acc in self.accounts.values()) + 1e-9
        total_compute_used = sum(acc.compute_used for acc in self.accounts.values()) + 1e-9
        energy_utilisation = total_energy_used / (total_energy_used + self.planetary_energy_gw)
        compute_utilisation = total_compute_used / (total_compute_used + self.planetary_compute_pf)
        utilisation = max(energy_utilisation, compute_utilisation)
        if utilisation > self.dynamic_inflation_threshold:
            self.token_per_energy *= self.scarcity_multiplier
            self.token_per_compute *= self.scarcity_multiplier
        else:
            self.token_per_energy = max(self.token_per_energy / self.scarcity_multiplier, 0.01)
            self.token_per_compute = max(self.token_per_compute / self.scarcity_multiplier, 0.01)

    def snapshot(self) -> Dict[str, Dict[str, float]]:
        return {
            name: {
                "tokens": account.tokens,
                "staked": account.staked,
                "energy_allowance": account.energy_allowance,
                "compute_allowance": account.compute_allowance,
                "energy_used": account.energy_used,
                "compute_used": account.compute_used,
            }
            for name, account in self.accounts.items()
        }

    def to_state(self) -> Dict[str, float | Dict[str, Dict[str, float]]]:
        return {
            "planetary_energy_gw": self.planetary_energy_gw,
            "planetary_compute_pf": self.planetary_compute_pf,
            "token_supply": self.token_supply,
            "token_per_energy": self.token_per_energy,
            "token_per_compute": self.token_per_compute,
            "accounts": self.snapshot(),
        }

    def restore(self, snapshot: Dict[str, float | Dict[str, Dict[str, float]]]) -> None:
        self.planetary_energy_gw = float(snapshot.get("planetary_energy_gw", self.planetary_energy_gw))
        self.planetary_compute_pf = float(snapshot.get("planetary_compute_pf", self.planetary_compute_pf))
        self.token_supply = float(snapshot.get("token_supply", self.token_supply))
        self.token_per_energy = float(snapshot.get("token_per_energy", self.token_per_energy))
        self.token_per_compute = float(snapshot.get("token_per_compute", self.token_per_compute))
        accounts = snapshot.get("accounts", {})
        if isinstance(accounts, dict):
            for name, data in accounts.items():
                account = self.accounts.get(name)
                if not account:
                    account = Account(tokens=0.0)
                    self.accounts[name] = account
                account.tokens = float(data.get("tokens", account.tokens))
                account.staked = float(data.get("staked", account.staked))
                account.energy_allowance = float(data.get("energy_allowance", account.energy_allowance))
                account.compute_allowance = float(data.get("compute_allowance", account.compute_allowance))
                account.energy_used = float(data.get("energy_used", account.energy_used))
                account.compute_used = float(data.get("compute_used", account.compute_used))
