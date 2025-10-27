"""Planetary resource accounting and token economy primitives."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict


@dataclass(slots=True)
class Ledger:
    """A simple token ledger mapping account identifiers to balances."""

    balances: Dict[str, float] = field(default_factory=dict)

    def ensure(self, account: str) -> None:
        self.balances.setdefault(account, 0.0)

    def credit(self, account: str, amount: float) -> None:
        self.ensure(account)
        self.balances[account] += amount

    def debit(self, account: str, amount: float) -> None:
        self.ensure(account)
        if self.balances[account] < amount:
            raise ValueError(f"Insufficient balance for {account}: requires {amount}, has {self.balances[account]}")
        self.balances[account] -= amount

    def snapshot(self) -> Dict[str, float]:
        return dict(self.balances)


@dataclass(slots=True)
class ResourceCaps:
    energy_capacity: float
    compute_capacity: float


class ResourceManager:
    """Tracks planetary energy/compute usage and agent token balances."""

    def __init__(self, caps: ResourceCaps, *, ledger: Ledger | None = None) -> None:
        self.caps = caps
        self.energy_available = caps.energy_capacity
        self.compute_available = caps.compute_capacity
        self.ledger = ledger or Ledger()
        self.consumption_log: list[dict[str, float]] = []
        self.dynamic_conversion_rate = 1.0  # compute unit per token

    def checkpoint_path(self, base_dir: Path) -> Path:
        return base_dir / "resource_manager.json"

    def restore(self, path: Path) -> None:
        if not path.exists():
            return
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.energy_available = payload["energy_available"]
        self.compute_available = payload["compute_available"]
        self.ledger.balances = {k: float(v) for k, v in payload["balances"].items()}
        self.dynamic_conversion_rate = float(payload.get("dynamic_conversion_rate", 1.0))

    def persist(self, path: Path) -> None:
        payload = {
            "energy_available": self.energy_available,
            "compute_available": self.compute_available,
            "balances": self.ledger.snapshot(),
            "dynamic_conversion_rate": self.dynamic_conversion_rate,
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def consume(self, *, agent: str, energy: float, compute: float) -> None:
        if energy > self.energy_available:
            raise ValueError("Energy capacity exhausted")
        if compute > self.compute_available:
            raise ValueError("Compute capacity exhausted")
        self.energy_available -= energy
        self.compute_available -= compute
        cost = (energy + compute) / max(self.dynamic_conversion_rate, 1e-6)
        self.ledger.debit(agent, max(cost, 0.0))
        self.consumption_log.append({"agent": agent, "energy": energy, "compute": compute, "cost": cost})
        self._rebalance_conversion_rate()

    def release(self, *, agent: str, energy: float, compute: float) -> None:
        self.energy_available = min(self.energy_available + energy, self.caps.energy_capacity)
        self.compute_available = min(self.compute_available + compute, self.caps.compute_capacity)
        refund = (energy + compute) * 0.1 / max(self.dynamic_conversion_rate, 1e-6)
        self.ledger.credit(agent, refund)
        self._rebalance_conversion_rate()

    def stake(self, account: str, amount: float) -> None:
        self.ledger.debit(account, amount)

    def reward(self, account: str, amount: float) -> None:
        self.ledger.credit(account, amount)

    def ensure_balance(self, account: str, amount: float) -> None:
        self.ledger.ensure(account)
        if self.ledger.balances[account] < amount:
            self.ledger.credit(account, amount - self.ledger.balances[account])

    def _rebalance_conversion_rate(self) -> None:
        utilisation = 1 - (
            (self.energy_available / self.caps.energy_capacity + self.compute_available / self.caps.compute_capacity) / 2
        )
        self.dynamic_conversion_rate = max(0.1, 1.0 + utilisation)

