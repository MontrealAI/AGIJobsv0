from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict

from .events import EventBus


@dataclass
class ValidatorRecord:
    address: str
    ens: str
    stake: Decimal


class StakeManager:
    def __init__(self, bus: EventBus, owner: str) -> None:
        self.bus = bus
        self.owner = owner.lower()
        self.validators: Dict[str, ValidatorRecord] = {}

    def register_validator(self, address: str, ens: str, stake: Decimal) -> None:
        record = ValidatorRecord(address.lower(), ens, stake)
        self.validators[record.address] = record
        self.bus.emit(
            "ValidatorRegistered",
            address=record.address,
            ens=ens,
            stake=str(stake),
        )

    def get(self, address: str) -> ValidatorRecord:
        record = self.validators.get(address.lower())
        if record is None:
            raise KeyError(f"validator {address} unknown")
        return record

    def slash(self, address: str, fraction: float, *, reason: str) -> Decimal:
        record = self.get(address)
        penalty = record.stake * Decimal(str(fraction))
        record.stake = max(Decimal("0"), record.stake - penalty)
        self.bus.emit(
            "ValidatorSlashed",
            address=record.address,
            ens=record.ens,
            penalty=str(penalty),
            reason=reason,
        )
        return penalty

    def adjust_stake(self, address: str, new_stake: Decimal) -> None:
        record = self.get(address)
        record.stake = new_stake
        self.bus.emit(
            "StakeAdjusted",
            address=record.address,
            stake=str(new_stake),
        )

    def total_stake(self) -> Decimal:
        return sum(record.stake for record in self.validators.values())

    def active_validators(self) -> Dict[str, ValidatorRecord]:
        return dict(self.validators)
