"""Planetary resource and token governance extensions for Omega V7."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping

from kardashev_ii_omega_grade_alpha_agi_business_3_demo.resources import (
    ResourceManager as BaseResourceManager,
)


@dataclass(slots=True)
class LedgerEntry:
    """Structured event recorded to the planetary ledger."""

    timestamp: str
    actor: str
    event: str
    fields: Dict[str, Any]


class PlanetaryResourceLedger(BaseResourceManager):
    """Extends the base resource manager with an auditable ledger."""

    def __init__(
        self,
        *,
        energy_capacity: float,
        compute_capacity: float,
        base_token_supply: float,
        ledger_path: Path,
        history_limit: int = 8192,
    ) -> None:
        super().__init__(
            energy_capacity=energy_capacity,
            compute_capacity=compute_capacity,
            base_token_supply=base_token_supply,
        )
        self._ledger_path = ledger_path
        self._ledger_path.parent.mkdir(parents=True, exist_ok=True)
        self._history_limit = max(1, int(history_limit))
        self._ledger: list[LedgerEntry] = []

    def _record(self, actor: str, event: str, **fields: Any) -> None:
        entry = LedgerEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            actor=actor,
            event=event,
            fields={k: v for k, v in fields.items() if v is not None},
        )
        self._ledger.append(entry)
        self._ledger = self._ledger[-self._history_limit :]
        self._flush()

    def _flush(self) -> None:
        payload = [
            {
                "timestamp": entry.timestamp,
                "actor": entry.actor,
                "event": entry.event,
                "fields": entry.fields,
            }
            for entry in self._ledger
        ]
        self._ledger_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def allocate_budget(self, actor: str, *, energy: float, compute: float) -> None:
        self.reserve_budget(actor, energy=energy, compute=compute)
        self._record(actor, "reserve_budget", energy=energy, compute=compute)

    def release_budget(self, key: str) -> tuple[float, float]:  # type: ignore[override]
        released = super().release_budget(key)
        self._record(key, "release_budget", energy=released[0], compute=released[1])
        return released

    def debit_tokens(self, name: str, amount: float) -> None:  # type: ignore[override]
        super().debit_tokens(name, amount)
        self._record(name, "debit_tokens", amount=amount)

    def credit_tokens(self, name: str, amount: float) -> None:  # type: ignore[override]
        super().credit_tokens(name, amount)
        self._record(name, "credit_tokens", amount=amount)

    def lock_stake(self, name: str, amount: float) -> None:  # type: ignore[override]
        super().lock_stake(name, amount)
        self._record(name, "lock_stake", amount=amount)

    def release_stake(self, name: str, amount: float) -> None:  # type: ignore[override]
        super().release_stake(name, amount)
        self._record(name, "release_stake", amount=amount)

    def slash(self, name: str, amount: float) -> None:  # type: ignore[override]
        super().slash(name, amount)
        self._record(name, "slash", amount=amount)

    def record_usage(self, name: str, energy: float, compute: float) -> None:  # type: ignore[override]
        super().record_usage(name, energy, compute)
        self._record(name, "record_usage", energy=energy, compute=compute)

    def restore_ledger(self, entries: Iterable[Mapping[str, Any]]) -> None:
        self._ledger.clear()
        for entry in entries:
            self._ledger.append(
                LedgerEntry(
                    timestamp=str(entry.get("timestamp")),
                    actor=str(entry.get("actor", "unknown")),
                    event=str(entry.get("event", "unknown")),
                    fields=dict(entry.get("fields", {})),
                )
            )
        self._ledger = self._ledger[-self._history_limit :]
        self._flush()


__all__ = ["LedgerEntry", "PlanetaryResourceLedger"]
