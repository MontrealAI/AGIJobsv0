"""Sentinel safeguards for the OMNI demo."""
from __future__ import annotations

import dataclasses
import math
import sys
from pathlib import Path
from typing import Dict

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from omni_engine import OmniCurriculumEngine


@dataclasses.dataclass
class SentinelConfig:
    roi_floor: float = 1.5
    budget_limit: float = 100.0
    moi_daily_max: int = 1000
    min_entropy: float = 0.75


class Sentinel:
    def __init__(self, engine: OmniCurriculumEngine, config: SentinelConfig) -> None:
        self.engine = engine
        self.config = config
        self._task_budget: Dict[str, float] = {}
        self._moi_queries = 0
        self._total_cost = 0.0

    # ------------------------------------------------------------------
    def register_outcome(self, task_id: str, reward_value: float, cost: float) -> None:
        self._task_budget[task_id] = self._task_budget.get(task_id, 0.0) + cost
        self._total_cost += cost
        if self._total_cost > self.config.budget_limit:
            for state in self.engine.tasks.values():
                state.interesting = True
            self.engine.moi_client.boring_weight = 1.0

    # ------------------------------------------------------------------
    def register_moi_query(self) -> None:
        self._moi_queries += 1
        if self._moi_queries >= self.config.moi_daily_max:
            self.engine.moi_client.boring_weight = 1.0

    # ------------------------------------------------------------------
    def enforce_entropy_floor(self) -> bool:
        distribution = self.engine.distribution
        entropy = -sum(p * math.log(p) for p in distribution.values() if p > 0)
        max_entropy = math.log(len(distribution)) if distribution else 1.0
        normalised_entropy = entropy / max_entropy if max_entropy > 0 else 0.0
        if normalised_entropy < self.config.min_entropy:
            for task_id, state in self.engine.tasks.items():
                state.interesting = True
            self.engine.moi_client.boring_weight = 0.1
            self.engine.refresh_partition(force=True)
            return True
        return False
