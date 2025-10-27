"""Resource and token accounting for the Omega-grade demo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class ResourceSnapshot:
    """Immutable view of planetary resource state."""

    energy_available: float
    compute_available: float
    token_supply: float
    locked_supply: float
    reserved_energy: float
    reserved_compute: float
    energy_capacity: float
    compute_capacity: float


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
        self._reservations: Dict[str, tuple[float, float]] = {}

    @property
    def energy_capacity(self) -> float:
        """Return the current planetary energy capacity."""

        return self._base_energy_capacity

    @property
    def compute_capacity(self) -> float:
        """Return the current planetary compute capacity."""

        return self._base_compute_capacity

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

    def get_account(self, name: str) -> Account:
        account = self._accounts.get(name)
        if account is None:
            raise KeyError(f"Unknown account {name}")
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
        if amount <= 0:
            return
        release = min(amount, account.locked)
        if release <= 0:
            return
        account.locked -= release
        account.tokens += release

    def slash(self, name: str, amount: float) -> None:
        account = self.ensure_account(name)
        if amount <= 0:
            return
        penalty = min(amount, account.locked)
        if penalty <= 0:
            return
        account.locked -= penalty
        self.token_supply = max(0.0, self.token_supply - penalty)

    def record_usage(self, name: str, energy: float, compute: float) -> None:
        account = self.ensure_account(name)
        if energy > self.energy_available or compute > self.compute_available:
            raise ValueError("Insufficient planetary resources for request")
        self.energy_available -= energy
        self.compute_available -= compute
        account.energy_quota += energy
        account.compute_quota += compute
        self._rebalance_prices()

    def reserve_budget(self, key: str, *, energy: float = 0.0, compute: float = 0.0) -> None:
        """Reserve planetary resources for an in-flight job.

        Reservations protect energy/compute capacity for long running work so the
        orchestrator can refuse new jobs that would oversubscribe the planet.
        Repeated calls adjust the reservation; deltas are reconciled against the
        remaining availability.
        """

        if not key:
            raise ValueError("Reservation key must be provided")
        energy = max(0.0, float(energy))
        compute = max(0.0, float(compute))
        current_energy, current_compute = self._reservations.get(key, (0.0, 0.0))
        delta_energy = energy - current_energy
        delta_compute = compute - current_compute
        if delta_energy > 0 and delta_energy > self.energy_available:
            raise ValueError("Insufficient energy capacity for reservation")
        if delta_compute > 0 and delta_compute > self.compute_available:
            raise ValueError("Insufficient compute capacity for reservation")
        self.energy_available -= delta_energy
        self.compute_available -= delta_compute
        self.energy_available = min(self.energy_available, self.energy_capacity)
        self.compute_available = min(self.compute_available, self.compute_capacity)
        self._reservations[key] = (energy, compute)
        self._rebalance_prices()

    def release_budget(self, key: str) -> tuple[float, float]:
        """Release a reservation, returning the freed (energy, compute)."""

        energy, compute = self._reservations.pop(key, (0.0, 0.0))
        if energy:
            self.energy_available = min(self.energy_capacity, self.energy_available + energy)
        if compute:
            self.compute_available = min(self.compute_capacity, self.compute_available + compute)
        self._rebalance_prices()
        return energy, compute

    def reservation_for(self, key: str) -> tuple[float, float]:
        """Return the reservation tuple (energy, compute) for ``key``."""

        return self._reservations.get(key, (0.0, 0.0))

    def restore_reservation(self, key: str, energy: float, compute: float) -> None:
        """Rehydrate a reservation without mutating availability."""

        if not key:
            return
        self._reservations[key] = (max(0.0, float(energy)), max(0.0, float(compute)))

    @property
    def reserved_energy(self) -> float:
        return sum(value[0] for value in self._reservations.values())

    @property
    def reserved_compute(self) -> float:
        return sum(value[1] for value in self._reservations.values())

    def update_capacity(
        self,
        *,
        energy_capacity: float | None = None,
        compute_capacity: float | None = None,
        energy_available: float | None = None,
        compute_available: float | None = None,
    ) -> None:
        if energy_capacity is not None:
            self._base_energy_capacity = max(0.0, energy_capacity)
        if compute_capacity is not None:
            self._base_compute_capacity = max(0.0, compute_capacity)
        if energy_available is not None:
            self.energy_available = max(0.0, energy_available)
        if compute_available is not None:
            self.compute_available = max(0.0, compute_available)
        self.energy_available = min(self.energy_available, self.energy_capacity)
        self.compute_available = min(self.compute_available, self.compute_capacity)
        self._rebalance_prices()

    def adjust_account(
        self,
        name: str,
        *,
        tokens: float | None = None,
        locked: float | None = None,
        energy_quota: float | None = None,
        compute_quota: float | None = None,
    ) -> Account:
        account = self.ensure_account(name)
        if tokens is not None:
            delta = tokens - account.tokens
            account.tokens = tokens
            self.token_supply += delta
        if locked is not None:
            account.locked = locked
        if energy_quota is not None:
            account.energy_quota = energy_quota
        if compute_quota is not None:
            account.compute_quota = compute_quota
        return account

    def snapshot(self) -> ResourceSnapshot:
        return ResourceSnapshot(
            energy_available=self.energy_available,
            compute_available=self.compute_available,
            token_supply=self.token_supply,
            locked_supply=self.locked_supply,
            reserved_energy=self.reserved_energy,
            reserved_compute=self.reserved_compute,
            energy_capacity=self.energy_capacity,
            compute_capacity=self.compute_capacity,
        )

    def to_serializable(self) -> Dict[str, object]:
        return {
            "state": {
                "energy_available": self.energy_available,
                "compute_available": self.compute_available,
                "energy_capacity": self.energy_capacity,
                "compute_capacity": self.compute_capacity,
                "token_supply": self.token_supply,
                "energy_price": self.energy_price,
                "compute_price": self.compute_price,
            },
            "accounts": {
                name: {
                    "tokens": account.tokens,
                    "locked": account.locked,
                    "energy_quota": account.energy_quota,
                    "compute_quota": account.compute_quota,
                }
                for name, account in self._accounts.items()
            },
            "reservations": {
                key: {"energy": values[0], "compute": values[1]}
                for key, values in self._reservations.items()
            },
        }

    def restore_state(self, payload: Dict[str, float]) -> None:
        """Restore global fields from a checkpoint snapshot."""

        if "energy_capacity" in payload:
            self._base_energy_capacity = max(0.0, float(payload["energy_capacity"]))
        if "compute_capacity" in payload:
            self._base_compute_capacity = max(0.0, float(payload["compute_capacity"]))
        if "energy_available" in payload:
            self.energy_available = max(0.0, float(payload["energy_available"]))
        else:
            self.energy_available = min(self.energy_available, self.energy_capacity)
        if "compute_available" in payload:
            self.compute_available = max(0.0, float(payload["compute_available"]))
        else:
            self.compute_available = min(self.compute_available, self.compute_capacity)
        if "token_supply" in payload:
            self.token_supply = float(payload["token_supply"])
        if "energy_price" in payload:
            self.energy_price = max(0.0, float(payload["energy_price"]))
        if "compute_price" in payload:
            self.compute_price = max(0.0, float(payload["compute_price"]))
        self.energy_available = min(self.energy_available, self.energy_capacity)
        self.compute_available = min(self.compute_available, self.compute_capacity)
        self._rebalance_prices()

    def reservations_snapshot(self) -> Dict[str, Dict[str, float]]:
        """Return a JSON-serialisable copy of active reservations."""

        return {
            key: {"energy": energy, "compute": compute}
            for key, (energy, compute) in self._reservations.items()
        }

    def _rebalance_prices(self) -> None:
        # Basic scarcity pricing to discourage exhaustion.
        compute_ratio = self.compute_available / max(self._base_compute_capacity, 1.0)
        energy_ratio = self.energy_available / max(self._base_energy_capacity, 1.0)
        self.compute_price = 1.0 + max(0.0, 1.0 - compute_ratio)
        self.energy_price = 1.0 + max(0.0, 1.0 - energy_ratio)

    @property
    def locked_supply(self) -> float:
        return sum(account.locked for account in self._accounts.values())

