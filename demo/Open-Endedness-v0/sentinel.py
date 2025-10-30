"""Sentinel guardrails for the OMNI demo."""

from __future__ import annotations

import dataclasses
import math
from typing import Dict, List, Optional

try:  # pragma: no cover - fallback for script execution
    from .ledger import EconomicLedger
    from .omni_engine import OmniCurriculumEngine
except ImportError:  # pragma: no cover - executed when running as script
    from ledger import EconomicLedger  # type: ignore[import-not-found]
    from omni_engine import OmniCurriculumEngine  # type: ignore[import-not-found]


@dataclasses.dataclass
class SentinelConfig:
    task_roi_floor: float = 1.5
    overall_roi_floor: float = 2.0
    budget_limit: float = 100.0
    moi_daily_max: int = 1000
    min_entropy: float = 0.75
    qps_limit: float = 0.1
    fm_cost_per_query: float = 0.02


class Sentinel:
    def __init__(self, engine: OmniCurriculumEngine, config: SentinelConfig) -> None:
        self.engine = engine
        self.config = config
        self.events: List[Dict[str, object]] = []
        self._total_cost = 0.0
        self._queries = 0
        self._last_query_step: Optional[int] = None
        self._moi_locked = False
        self._disabled_tasks: Dict[str, str] = {}
        self._pending_fm_cost = 0.0

    # ------------------------------------------------------------------
    def register_outcome(self, task_id: str, reward_value: float, cost: float) -> None:
        fm_offset = min(cost, self._pending_fm_cost)
        if fm_offset:
            self._pending_fm_cost -= fm_offset
        net_cost = cost - fm_offset
        if net_cost:
            self._total_cost += net_cost
        if self._total_cost > self.config.budget_limit and not self._moi_locked:
            self._moi_locked = True
            self.events.append(
                {
                    "action": "sentinel_budget_lock",
                    "task_id": task_id,
                    "total_cost": self._total_cost,
                }
            )

    def register_moi_query(self, step: int, fm_cost: Optional[float] = None) -> None:
        if self._moi_locked:
            return
        cost = fm_cost if fm_cost is not None else self.config.fm_cost_per_query
        self._total_cost += cost
        self._pending_fm_cost += cost
        self._queries += 1
        self._last_query_step = step
        if self._total_cost > self.config.budget_limit:
            self._moi_locked = True
            self.events.append(
                {
                    "action": "sentinel_budget_lock",
                    "step": step,
                    "total_cost": self._total_cost,
                }
            )
        elif self._queries >= self.config.moi_daily_max:
            self._moi_locked = True
            self.events.append(
                {
                    "action": "sentinel_moi_cap_reached",
                    "step": step,
                    "queries": self._queries,
                }
            )

    def can_issue_fm_query(self, step: int) -> bool:
        if self._moi_locked:
            return False
        cost_projection = self._total_cost + self.config.fm_cost_per_query
        if cost_projection > self.config.budget_limit:
            self._moi_locked = True
            self.events.append(
                {
                    "action": "sentinel_budget_lock",
                    "step": step,
                    "total_cost": cost_projection,
                }
            )
            return False
        if self._queries >= self.config.moi_daily_max:
            self._moi_locked = True
            self.events.append(
                {
                    "action": "sentinel_moi_cap_reached",
                    "step": step,
                    "queries": self._queries,
                }
            )
            return False
        if self.config.qps_limit > 0 and self._last_query_step is not None:
            min_gap = max(int(math.ceil(1 / self.config.qps_limit)), 1)
            if step - self._last_query_step < min_gap:
                self.events.append(
                    {
                        "action": "sentinel_qps_delay",
                        "step": step,
                        "wait_until": self._last_query_step + min_gap,
                    }
                )
                return False
        return True

    # ------------------------------------------------------------------
    def evaluate(self, ledger: EconomicLedger, step: int) -> None:
        summary = ledger.task_summary()
        for task_id, metrics in summary.items():
            if metrics["attempts"] < 3:
                continue
            if metrics["roi"] < self.config.task_roi_floor:
                if task_id not in self._disabled_tasks:
                    self.engine.set_task_disabled(task_id, True)
                    self._disabled_tasks[task_id] = "roi_floor"
                    self.events.append(
                        {
                            "action": "sentinel_disable_task",
                            "step": step,
                            "task_id": task_id,
                            "roi": metrics["roi"],
                        }
                    )

        totals = ledger.totals()
        if (
            totals["roi_overall"] != float("inf")
            and totals["roi_overall"] < self.config.overall_roi_floor
            and not self._moi_locked
        ):
            self._moi_locked = True
            self.events.append(
                {
                    "action": "sentinel_overall_roi_pause",
                    "step": step,
                    "roi": totals["roi_overall"],
                }
            )
            for task_id in list(self._disabled_tasks):
                self.engine.set_task_disabled(task_id, False)
            self._disabled_tasks.clear()
            self.engine.moi_client.boring_weight = 1.0

        self.enforce_entropy_floor(step)

    def enforce_entropy_floor(self, step: int) -> bool:
        distribution = self.engine.distribution
        positive_probs = [p for p in distribution.values() if p > 0]
        if not positive_probs:
            return False
        entropy = -sum(p * math.log(p) for p in positive_probs)
        max_entropy = math.log(len(positive_probs)) if positive_probs else 1.0
        normalised_entropy = entropy / max_entropy if max_entropy > 0 else 0.0
        if normalised_entropy < self.config.min_entropy:
            for task_id in list(self._disabled_tasks):
                self.engine.set_task_disabled(task_id, False)
            self._disabled_tasks.clear()
            self.engine.moi_client.boring_weight = 0.1
            self.engine.refresh_partition(force=True)
            self.events.append(
                {
                    "action": "sentinel_entropy_rebalance",
                    "step": step,
                    "entropy": normalised_entropy,
                }
            )
            return True
        return False
