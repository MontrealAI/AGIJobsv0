"""Planetary-scale resource and token accounting."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
from typing import Dict, Mapping, MutableMapping

from .config import DemoConfig
from .logging_utils import log_json

logger = logging.getLogger(__name__)


@dataclass
class LedgerEntry:
    balance: float = 0.0
    staked: float = 0.0

    def snapshot(self) -> Mapping[str, float]:
        return {"balance": self.balance, "staked": self.staked}


@dataclass
class ResourceState:
    energy_gw: float
    compute_pf: float
    storage_eb: float
    token_supply: float
    dynamic_compute_price: float = 1.0
    last_adjusted_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Mapping[str, float]:
        return {
            "energy_gw": self.energy_gw,
            "compute_pf": self.compute_pf,
            "storage_eb": self.storage_eb,
            "token_supply": self.token_supply,
            "dynamic_compute_price": self.dynamic_compute_price,
            "last_adjusted_at": self.last_adjusted_at.isoformat(),
        }


class ResourceManager:
    """Tracks planetary resources and a simplified AGIALPHA ledger."""

    def __init__(self, config: DemoConfig, *, initial_supply: float = 1_000_000.0) -> None:
        self._config = config
        self._state = ResourceState(
            energy_gw=config.resource_caps.energy_gw,
            compute_pf=config.resource_caps.compute_pf,
            storage_eb=config.resource_caps.storage_eb,
            token_supply=initial_supply,
        )
        self._ledger: Dict[str, LedgerEntry] = {}

    # ------------------------------------------------------------------ ledger
    def _entry(self, account: str) -> LedgerEntry:
        return self._ledger.setdefault(account, LedgerEntry())

    def credit(self, account: str, amount: float) -> None:
        entry = self._entry(account)
        entry.balance += amount
        log_json(logger, "ledger_credit", account=account, amount=amount, balance=entry.balance)

    def debit(self, account: str, amount: float) -> None:
        entry = self._entry(account)
        if entry.balance < amount:
            raise ValueError(f"Insufficient balance for {account}")
        entry.balance -= amount
        log_json(logger, "ledger_debit", account=account, amount=amount, balance=entry.balance)

    def stake(self, account: str, amount: float) -> None:
        entry = self._entry(account)
        if entry.balance < amount:
            raise ValueError(f"Insufficient balance to stake for {account}")
        entry.balance -= amount
        entry.staked += amount
        log_json(logger, "stake_locked", account=account, amount=amount, staked=entry.staked)

    def release_stake(self, account: str, amount: float, *, slash: bool = False) -> None:
        entry = self._entry(account)
        if entry.staked < amount:
            raise ValueError(f"Insufficient staked amount for {account}")
        entry.staked -= amount
        if not slash:
            entry.balance += amount
        else:
            self._state.token_supply -= amount
        log_json(
            logger,
            "stake_released",
            account=account,
            amount=amount,
            staked=entry.staked,
            slash=slash,
        )

    def balances(self) -> Mapping[str, Mapping[str, float]]:
        return {account: entry.snapshot() for account, entry in self._ledger.items()}

    # ------------------------------------------------------------ resource caps
    def consume(self, *, energy_gw: float = 0.0, compute_pf: float = 0.0) -> None:
        if energy_gw > self._state.energy_gw or compute_pf > self._state.compute_pf:
            raise ValueError("Resource limits exceeded")
        self._state.energy_gw -= energy_gw
        self._state.compute_pf -= compute_pf
        log_json(
            logger,
            "resource_consumed",
            energy_gw=energy_gw,
            compute_pf=compute_pf,
            remaining_energy=self._state.energy_gw,
            remaining_compute=self._state.compute_pf,
        )
        self._adjust_dynamic_pricing()

    def release(self, *, energy_gw: float = 0.0, compute_pf: float = 0.0) -> None:
        self._state.energy_gw = min(self._state.energy_gw + energy_gw, self._config.resource_caps.energy_gw)
        self._state.compute_pf = min(
            self._state.compute_pf + compute_pf, self._config.resource_caps.compute_pf
        )
        log_json(
            logger,
            "resource_released",
            energy_gw=energy_gw,
            compute_pf=compute_pf,
            energy_capacity=self._state.energy_gw,
            compute_capacity=self._state.compute_pf,
        )

    def snapshot(self) -> Mapping[str, float]:
        return self._state.to_dict()

    # --------------------------------------------------------- dynamic pricing
    def _adjust_dynamic_pricing(self) -> None:
        utilisation = 1 - (self._state.compute_pf / self._config.resource_caps.compute_pf)
        self._state.dynamic_compute_price = 1 + utilisation * 2
        self._state.last_adjusted_at = datetime.now(timezone.utc)
        log_json(
            logger,
            "pricing_adjusted",
            utilisation=utilisation,
            dynamic_price=self._state.dynamic_compute_price,
        )

    def compute_cost(self, compute_pf: float) -> float:
        return compute_pf * self._state.dynamic_compute_price

    def ensure_account(self, account: str, *, initial_balance: float = 10_000.0) -> None:
        entry = self._entry(account)
        if entry.balance == entry.staked == 0:
            entry.balance = initial_balance
            log_json(logger, "account_bootstrapped", account=account, balance=initial_balance)
