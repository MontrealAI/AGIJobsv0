"""Economic primitives for staking and rewards."""
from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Dict, Iterable, List

from .config import EconomyConfig


@dataclass
class StakePosition:
    amount: float
    since: datetime

    def to_json(self) -> str:
        return json.dumps({"amount": self.amount, "since": self.since.isoformat()})


@dataclass
class RewardRecord:
    timestamp: datetime
    amount: float
    source: str

    def to_dict(self) -> Dict[str, str]:
        return {"timestamp": self.timestamp.isoformat(), "amount": f"{self.amount:.2f}", "source": self.source}


@dataclass
class EconomyState:
    stake: StakePosition
    rewards: List[RewardRecord] = field(default_factory=list)
    reinvested: float = 0.0

    def latest_rewards(self, limit: int = 5) -> Iterable[RewardRecord]:
        return self.rewards[-limit:]


class EconomyEngine:
    """Simulates the $AGIALPHA economy."""

    def __init__(self, config: EconomyConfig) -> None:
        self._config = config
        self._state = EconomyState(stake=StakePosition(amount=config.minimum_stake, since=datetime.now(UTC)))

    @property
    def config(self) -> EconomyConfig:
        return self._config

    @property
    def state(self) -> EconomyState:
        return self._state

    def accrue_rewards(self) -> RewardRecord:
        simulated_amount = random.uniform(0.01, 0.05) * self._state.stake.amount / 100
        record = RewardRecord(timestamp=datetime.now(UTC), amount=simulated_amount, source="autonomous_jobs")
        self._state.rewards.append(record)
        return record

    def reinvest_rewards(self, ratio: float | None = None) -> float:
        ratio = ratio if ratio is not None else self._config.reinvestment_ratio
        distributable = sum(r.amount for r in self._state.rewards)
        reinvest_amount = distributable * ratio
        self._state.stake.amount += reinvest_amount
        self._state.reinvested += reinvest_amount
        self._state.rewards.clear()
        return reinvest_amount

    def add_stake(self, amount: float) -> None:
        self._state.stake.amount += amount

    def withdraw_stake(self, amount: float) -> None:
        if amount > self._state.stake.amount:
            raise ValueError("Cannot withdraw more than staked amount")
        self._state.stake.amount -= amount

    def export_state(self) -> Dict[str, str]:
        return {
            "stake_amount": f"{self._state.stake.amount:.2f}",
            "reinvested": f"{self._state.reinvested:.2f}",
            "reward_events": str(len(self._state.rewards)),
        }
