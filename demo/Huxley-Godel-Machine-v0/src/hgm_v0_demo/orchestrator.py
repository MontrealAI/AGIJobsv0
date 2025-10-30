"""Asynchronous simulation orchestrator for the HGM demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple
import math
import random

from .engine import ActionType, HGMEngine
from .lineage import capture_agent_snapshots
from .metrics import EconomicSnapshot, RunSummary, Timeline
from .owner_controls import OwnerControls
from .sentinel import Sentinel
from .thermostat import Thermostat


@dataclass
class PendingTask:
    action: ActionType
    agent_id: Optional[str]
    parent_id: Optional[str]
    complete_step: int
    payload: Optional[float] = None


class HGMDemoOrchestrator:
    def __init__(
        self,
        engine: HGMEngine,
        thermostat: Thermostat,
        sentinel: Sentinel,
        rng: random.Random,
        success_value: float,
        evaluation_cost: float,
        expansion_cost: float,
        mutation_std: float,
        quality_bounds: tuple[float, float],
        evaluation_latency_range: Tuple[float, float] | None = None,
        expansion_latency_range: Tuple[float, float] | None = None,
        owner_controls: OwnerControls | None = None,
    ) -> None:
        self.engine = engine
        self.thermostat = thermostat
        self.sentinel = sentinel
        self.rng = rng
        self.success_value = success_value
        self.evaluation_cost = evaluation_cost
        self.expansion_cost = expansion_cost
        self.mutation_std = mutation_std
        self.quality_bounds = quality_bounds
        self.timeline = Timeline(snapshots=[])
        self.pending: List[PendingTask] = []
        self.gmv = 0.0
        self.cost = 0.0
        self.successes = 0
        self.failures = 0
        self._evaluation_latency_range = evaluation_latency_range
        self._expansion_latency_range = expansion_latency_range
        self.owner_controls = owner_controls or OwnerControls()
        self._scheduled_actions = 0
        self._owner_cap_triggered = False
        self._sentinel_halt_all = False
        self._sentinel_pause_expansions = False
        self._sentinel_pause_evaluations = False

    def run(self, total_steps: int, report_interval: int) -> RunSummary:
        for step in range(1, total_steps + 1):
            self._process_completed(step)
            self._schedule_until_blocked(step)
            roi = self._compute_roi()
            agents = capture_agent_snapshots(self.engine)
            best_agent = self.engine.best_agent()
            best_agent_id = best_agent.agent_id if best_agent is not None else None
            snapshot = EconomicSnapshot(
                step=step,
                gmv=self.gmv,
                cost=self.cost,
                successes=self.successes,
                failures=self.failures,
                roi=roi,
                agents=agents,
                best_agent_id=best_agent_id,
            )
            self.timeline.append(snapshot)
            self.thermostat.observe(snapshot)
            decision = self.sentinel.evaluate(snapshot)
            self._sentinel_halt_all = decision.halt_all
            self._sentinel_pause_expansions = decision.pause_expansions
            self._sentinel_pause_evaluations = decision.pause_evaluations

            if decision.halt_all:
                break
            if step % report_interval == 0:
                self._emit_progress(step)
        final_roi = self._compute_roi()
        profit = self.gmv - self.cost
        final_best = self.engine.best_agent()
        best_agent_id = final_best.agent_id if final_best is not None else None
        best_agent_quality = final_best.quality if final_best is not None else None
        owner_notes = self.owner_controls.describe(
            consumed_actions=self._scheduled_actions,
            cap_triggered=self._owner_cap_triggered,
        )
        return RunSummary(
            strategy="HGM",
            gmv=self.gmv,
            cost=self.cost,
            successes=self.successes,
            failures=self.failures,
            roi=final_roi,
            profit=profit,
            steps=len(self.timeline.snapshots),
            best_agent_id=best_agent_id,
            best_agent_quality=best_agent_quality,
            owner_notes=owner_notes,
        )

    # ------------------------------------------------------------------
    def _process_completed(self, step: int) -> None:
        remaining: List[PendingTask] = []
        for task in self.pending:
            if task.complete_step <= step:
                if task.action is ActionType.EXPAND and task.parent_id is not None and task.payload is not None:
                    quality = self._bounded_quality(task.payload)
                    self.engine.complete_expansion(task.parent_id, quality)
                    self.cost += self.expansion_cost
                elif task.action is ActionType.EVALUATE and task.agent_id is not None:
                    success = self.rng.random() < (task.payload or 0.0)
                    self.engine.record_evaluation(task.agent_id, success)
                    self.cost += self.evaluation_cost
                    if success:
                        self.successes += 1
                        self.gmv += self.success_value
                    else:
                        self.failures += 1
            else:
                remaining.append(task)
        self.pending = remaining

    def _schedule_until_blocked(self, step: int) -> None:
        while True:
            if self.owner_controls.should_block_new_actions(self._scheduled_actions):
                if self.owner_controls.max_actions is not None:
                    self._owner_cap_triggered = True
                break
            self._apply_control_flags()
            action = self.engine.next_action()
            if action.kind is ActionType.STOP:
                break
            if action.kind is ActionType.WAIT:
                break
            if action.kind is ActionType.EXPAND and action.parent_id is not None:
                parent = self.engine.get_agent(action.parent_id)
                proposed_quality = parent.quality + self.rng.gauss(0, self.mutation_std)
                completion = step + self._expansion_duration()
                self.pending.append(
                    PendingTask(
                        action=ActionType.EXPAND,
                        agent_id=None,
                        parent_id=action.parent_id,
                        complete_step=completion,
                        payload=proposed_quality,
                    )
                )
                self._scheduled_actions += 1
            elif action.kind is ActionType.EVALUATE and action.agent_id is not None:
                agent = self.engine.get_agent(action.agent_id)
                completion = step + self._evaluation_duration()
                self.pending.append(
                    PendingTask(
                        action=ActionType.EVALUATE,
                        agent_id=action.agent_id,
                        parent_id=None,
                        complete_step=completion,
                        payload=agent.quality,
                    )
                )
                self._scheduled_actions += 1
            else:
                break

    def _compute_roi(self) -> float:
        if self.cost <= 0:
            return float("inf")
        return self.gmv / self.cost

    def _emit_progress(self, step: int) -> None:
        snapshot = self.timeline.last
        roi = "∞" if math.isinf(snapshot.roi) else f"{snapshot.roi:.2f}"
        print(
            f"[HGM] step={step:03d} agents={len(list(self.engine.agents())):02d} "
            f"successes={snapshot.successes} failures={snapshot.failures} "
            f"gmv={snapshot.gmv:.2f} cost={snapshot.cost:.2f} roi={roi}"
        )

    def _latency_from_range(self, latency_range: Tuple[float, float], minimum: int) -> int:
        low, high = latency_range
        if low > high:
            low, high = high, low
        if math.isclose(low, high):
            return max(minimum, int(round(low)))
        sample = self.rng.uniform(low, high)
        return max(minimum, int(round(sample)))

    def _evaluation_duration(self) -> int:
        if self._evaluation_latency_range is not None:
            return self._latency_from_range(self._evaluation_latency_range, 0)
        return max(1, int(self.rng.gammavariate(2.0, 0.7)))

    def _expansion_duration(self) -> int:
        if self._expansion_latency_range is not None:
            return self._latency_from_range(self._expansion_latency_range, 0)
        return max(2, int(self.rng.gammavariate(3.0, 0.8)))

    def _bounded_quality(self, quality: float) -> float:
        low, high = self.quality_bounds
        return max(low, min(high, quality))

    def _apply_control_flags(self) -> None:
        allow_expansions = (
            not self.owner_controls.pause_all
            and not self.owner_controls.pause_expansions
            and not self._sentinel_pause_expansions
        )
        allow_evaluations = (
            not self.owner_controls.pause_all
            and not self.owner_controls.pause_evaluations
            and not self._sentinel_halt_all
            and not self._sentinel_pause_evaluations
        )
        self.engine.expansions_allowed = allow_expansions
        self.engine.evaluations_allowed = allow_evaluations


__all__ = ["HGMDemoOrchestrator"]
