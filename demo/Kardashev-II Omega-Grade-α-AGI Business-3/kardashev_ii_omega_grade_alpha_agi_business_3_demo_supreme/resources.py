"""Planetary resource and token economy manager."""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, Optional


@dataclass(slots=True)
class Account:
    name: str
    tokens: float
    staked: float = 0.0
    energy_used: float = 0.0
    compute_used: float = 0.0

    def stake(self, amount: float) -> None:
        if amount > self.tokens:
            raise ValueError(f"{self.name} cannot stake {amount}: insufficient balance")
        self.tokens -= amount
        self.staked += amount

    def release_stake(self, amount: float) -> None:
        self.staked = max(0.0, self.staked - amount)
        self.tokens += amount

    def debit(self, amount: float) -> None:
        if amount > self.tokens:
            raise ValueError(f"{self.name} cannot spend {amount}: insufficient balance")
        self.tokens -= amount

    def credit(self, amount: float) -> None:
        self.tokens += amount


@dataclass(slots=True)
class ResourceSnapshot:
    epoch: float
    energy_available: float
    compute_available: float
    token_supply: float
    accounts: Dict[str, Account] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, object]:
        return {
            "epoch": self.epoch,
            "energy_available": self.energy_available,
            "compute_available": self.compute_available,
            "token_supply": self.token_supply,
            "accounts": {
                name: {
                    "tokens": acc.tokens,
                    "staked": acc.staked,
                    "energy_used": acc.energy_used,
                    "compute_used": acc.compute_used,
                }
                for name, acc in self.accounts.items()
            },
        }


class ResourceManager:
    """Tracks planetary-scale resources and AGI token balances."""

    def __init__(
        self,
        energy_reserve: float,
        compute_reserve: float,
        token_supply: float,
        snapshot_path: Optional[Path] = None,
    ) -> None:
        self.energy_reserve = energy_reserve
        self.compute_reserve = compute_reserve
        self.token_supply = token_supply
        self.accounts: Dict[str, Account] = {}
        self.snapshot_path = snapshot_path
        self.dynamic_cost_multiplier = 1.0

    def register_accounts(self, names: Iterable[str], initial_allocation: Optional[float] = None) -> None:
        initial = initial_allocation or self.token_supply / max(1, len(list(names)))
        for name in names:
            if name not in self.accounts:
                self.accounts[name] = Account(name=name, tokens=initial)

    def ensure_account(self, name: str) -> Account:
        if name not in self.accounts:
            self.accounts[name] = Account(name=name, tokens=self.token_supply * 0.01)
        return self.accounts[name]

    def allocate_resources(self, name: str, energy: float, compute: float) -> None:
        if energy > self.energy_reserve:
            raise ValueError("Insufficient global energy reserve")
        if compute > self.compute_reserve:
            raise ValueError("Insufficient global compute reserve")
        self.energy_reserve -= energy
        self.compute_reserve -= compute
        account = self.ensure_account(name)
        account.energy_used += energy
        account.compute_used += compute

    def release_resources(self, name: str, energy: float, compute: float) -> None:
        self.energy_reserve += energy
        self.compute_reserve += compute
        account = self.ensure_account(name)
        account.energy_used = max(0.0, account.energy_used - energy)
        account.compute_used = max(0.0, account.compute_used - compute)

    def charge_for_resources(self, name: str, energy: float, compute: float) -> float:
        base_cost = energy * 0.001 + compute * 0.0005
        dynamic_cost = base_cost * self.dynamic_cost_multiplier
        account = self.ensure_account(name)
        account.debit(dynamic_cost)
        self.token_supply -= dynamic_cost
        return dynamic_cost

    def reward(self, name: str, amount: float) -> None:
        account = self.ensure_account(name)
        account.credit(amount)
        self.token_supply += amount

    def slash(self, name: str, amount: float) -> float:
        account = self.ensure_account(name)
        penalty = min(amount, account.staked)
        account.staked -= penalty
        self.token_supply -= penalty * 0.5
        return penalty

    def adjust_multiplier(self, new_multiplier: float) -> None:
        self.dynamic_cost_multiplier = max(0.1, new_multiplier)

    def take_snapshot(self) -> ResourceSnapshot:
        snapshot = ResourceSnapshot(
            epoch=time.time(),
            energy_available=self.energy_reserve,
            compute_available=self.compute_reserve,
            token_supply=self.token_supply,
            accounts={name: acc for name, acc in self.accounts.items()},
        )
        if self.snapshot_path:
            payload = snapshot.to_dict()
            self.snapshot_path.parent.mkdir(parents=True, exist_ok=True)
            with self.snapshot_path.open("w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
        return snapshot

    def rehydrate_from_snapshot(self) -> None:
        if not self.snapshot_path or not self.snapshot_path.exists():
            return
        payload = json.loads(self.snapshot_path.read_text(encoding="utf-8"))
        self.energy_reserve = float(payload["energy_available"])
        self.compute_reserve = float(payload["compute_available"])
        self.token_supply = float(payload["token_supply"])
        self.accounts = {
            name: Account(
                name=name,
                tokens=float(details["tokens"]),
                staked=float(details["staked"]),
                energy_used=float(details["energy_used"]),
                compute_used=float(details["compute_used"]),
            )
            for name, details in payload.get("accounts", {}).items()
        }

    def adjust_prices_from_usage(self) -> None:
        utilization = 1.0 - min(
            1.0,
            math.sqrt(
                max(self.energy_reserve, 0.0) * max(self.compute_reserve, 0.0)
            )
            / math.sqrt(1 + self.energy_reserve + self.compute_reserve),
        )
        self.dynamic_cost_multiplier = max(0.5, 1.0 + utilization)

    def governance_update(self, field_name: str, value: float) -> None:
        if field_name == "energy_reserve":
            self.energy_reserve = value
        elif field_name == "compute_reserve":
            self.compute_reserve = value
        elif field_name == "token_supply":
            self.token_supply = value
        elif field_name == "dynamic_cost_multiplier":
            self.adjust_multiplier(value)
        else:
            raise ValueError(f"Unsupported governance update: {field_name}")


__all__ = ["ResourceManager", "Account", "ResourceSnapshot"]
