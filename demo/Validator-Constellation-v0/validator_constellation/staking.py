"""Stake management and slashing policies for the demo."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict

from .events import EventBus


@dataclass(slots=True)
class ValidatorStake:
    address: str
    ens_name: str
    stake: Decimal
    active: bool = True
    slashed_amount: Decimal = Decimal(0)


class StakeManager:
    """Holds validator stakes and triggers slashing penalties."""

    def __init__(self, event_bus: EventBus, owner_address: str) -> None:
        self._event_bus = event_bus
        self._owner = owner_address.lower()
        self._stakes: Dict[str, ValidatorStake] = {}

    def register_validator(self, address: str, ens_name: str, stake: Decimal) -> None:
        address = address.lower()
        if address in self._stakes:
            raise ValueError(f"Validator {address} already registered")
        self._stakes[address] = ValidatorStake(address=address, ens_name=ens_name, stake=stake)
        self._event_bus.publish(
            "ValidatorRegistered",
            {"address": address, "ens": ens_name, "stake": float(stake)},
        )

    def increase_stake(self, address: str, amount: Decimal) -> None:
        stake = self._get(address)
        stake.stake += amount
        self._event_bus.publish(
            "StakeIncreased",
            {"address": address.lower(), "delta": float(amount), "newStake": float(stake.stake)},
        )

    def deactivate(self, address: str) -> None:
        stake = self._get(address)
        stake.active = False
        self._event_bus.publish("ValidatorDeactivated", {"address": stake.address})

    def slash(self, address: str, fraction: float, reason: str) -> Decimal:
        stake = self._get(address)
        if not 0 < fraction <= 1:
            raise ValueError("Slash fraction must be between 0 and 1")
        penalty = stake.stake * Decimal(fraction)
        stake.stake -= penalty
        stake.slashed_amount += penalty
        self._event_bus.publish(
            "ValidatorSlashed",
            {
                "address": stake.address,
                "ens": stake.ens_name,
                "penalty": float(penalty),
                "remaining": float(stake.stake),
                "reason": reason,
            },
        )
        return penalty

    def reward(self, address: str, amount: Decimal, reason: str) -> Decimal:
        stake = self._get(address)
        stake.stake += amount
        self._event_bus.publish(
            "ValidatorRewarded",
            {
                "address": stake.address,
                "ens": stake.ens_name,
                "reward": float(amount),
                "newStake": float(stake.stake),
                "reason": reason,
            },
        )
        return amount

    def stake_of(self, address: str) -> Decimal:
        return self._get(address).stake

    def is_active(self, address: str) -> bool:
        return self._get(address).active

    def _get(self, address: str) -> ValidatorStake:
        normalized = address.lower()
        if normalized not in self._stakes:
            raise KeyError(f"Validator {address} is not registered")
        return self._stakes[normalized]

    @property
    def validators(self) -> Dict[str, ValidatorStake]:
        return dict(self._stakes)
