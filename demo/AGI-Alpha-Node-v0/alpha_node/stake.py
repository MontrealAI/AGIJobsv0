"""Stake, reward, and slashing simulators for the demo."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable

from .config import StakeSettings
from .state import StateStore


@dataclass(slots=True)
class StakeEvent:
    event: str
    amount: float
    total_locked: float
    timestamp: str


class StakeManager:
    """In-memory representation of the StakeManager contract."""

    def __init__(self, settings: StakeSettings, store: StateStore, ledger_path: Path) -> None:
        self.settings = settings
        self.store = store
        self.ledger_path = ledger_path
        if not ledger_path.exists():
            ledger_path.write_text("event,amount,total_locked,timestamp\n")

    def _record(self, event: str, amount: float, total_locked: float) -> StakeEvent:
        timestamp = datetime.now(UTC).isoformat()
        with self.ledger_path.open("a", encoding="utf-8") as ledger:
            ledger.write(f"{event},{amount},{total_locked},{timestamp}\n")
        self.store.append_audit(f"[{timestamp}] stake-event {event} {amount}")
        return StakeEvent(event=event, amount=amount, total_locked=total_locked, timestamp=timestamp)

    def deposit(self, amount: float) -> StakeEvent:
        state = self.store.read()
        new_total = state.stake_locked + amount
        self.store.update(stake_locked=new_total)
        return self._record("deposit", amount, new_total)

    def slash(self, amount: float) -> StakeEvent:
        state = self.store.read()
        new_total = max(0.0, state.stake_locked - amount)
        self.store.update(stake_locked=new_total)
        return self._record("slash", -amount, new_total)

    def accrue_rewards(self, amount: float) -> StakeEvent:
        state = self.store.read()
        new_total = state.total_rewards + amount
        self.store.update(total_rewards=new_total)
        return self._record("reward", amount, state.stake_locked)

    def restake_rewards(self) -> StakeEvent | None:
        state = self.store.read()
        if state.total_rewards < self.settings.restake_threshold:
            return None
        new_locked = state.stake_locked + state.total_rewards
        event = self._record("restake", state.total_rewards, new_locked)
        self.store.update(stake_locked=new_locked, total_rewards=0.0)
        return event

    def events(self) -> Iterable[StakeEvent]:
        if not self.ledger_path.exists():
            return []
        lines = self.ledger_path.read_text().splitlines()[1:]
        for line in lines:
            event, amount, total_locked, timestamp = line.split(",")
            yield StakeEvent(
                event=event,
                amount=float(amount),
                total_locked=float(total_locked),
                timestamp=timestamp,
            )

    def meets_minimum(self) -> bool:
        state = self.store.read()
        return state.stake_locked >= self.settings.minimum_stake


__all__ = ["StakeManager", "StakeEvent"]
