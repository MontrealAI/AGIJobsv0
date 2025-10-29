"""Task orchestration across specialists."""
from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Dict, Iterable, List

from .knowledge import KnowledgeLake
from .planner import MuZeroPlanner, Plan
from .specialists.biotech import BiotechSynthesist
from .specialists.finance import FinanceStrategist
from .specialists.manufacturing import ManufacturingOptimizer
from .specialists import Specialist, SpecialistOutput


@dataclass
class OrchestratedResult:
    plan: Plan
    specialist_outputs: Dict[str, SpecialistOutput]
    aggregate_score: float


class Orchestrator:
    """Delegates planner steps to the best-fit specialists."""

    def __init__(self, planner: MuZeroPlanner, knowledge: KnowledgeLake) -> None:
        self._planner = planner
        self._knowledge = knowledge
        self._specialists: List[Specialist] = [
            FinanceStrategist(),
            BiotechSynthesist(),
            ManufacturingOptimizer(),
        ]
        self._round_robin = itertools.cycle(self._specialists)

    def run_cycle(self, task: str) -> OrchestratedResult:
        plan = self._planner.plan(task)
        outputs: Dict[str, SpecialistOutput] = {}
        for step in plan.steps:
            specialist = next(self._round_robin)
            outputs[specialist.name] = specialist.run(step.description, self._knowledge)
        aggregate_score = sum(output.impact_score for output in outputs.values()) / len(outputs)
        return OrchestratedResult(plan=plan, specialist_outputs=outputs, aggregate_score=aggregate_score)

    def list_specialists(self) -> Iterable[str]:
        return [spec.name for spec in self._specialists]
