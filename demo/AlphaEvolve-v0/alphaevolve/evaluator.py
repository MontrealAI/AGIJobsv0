from __future__ import annotations

import asyncio
import contextlib
import statistics
from dataclasses import dataclass
from types import ModuleType
from typing import Iterable, List, Mapping, MutableMapping, Sequence

from . import heuristics
from .diff import ProposedDiff, apply_diff
from .heuristics import Agent, Job


@dataclass(slots=True)
class SimulationResults:
    gmv: float
    cost: float
    latency: float
    fairness: float
    acceptance_rate: float

    @property
    def utility(self) -> float:
        return self.gmv - self.cost


class SandboxViolation(Exception):
    pass


_ALLOWED_IMPORTS = {"math", "statistics"}


def _sandbox_guard(diff: ProposedDiff) -> None:
    for block in diff.blocks:
        for line in block.replace.splitlines():
            stripped = line.strip()
            if "__import__(" in stripped:
                raise SandboxViolation("Dynamic imports are not permitted")
            if stripped.startswith("import "):
                module = stripped.split()[1].split(".", 1)[0]
            elif stripped.startswith("from ") and " import " in stripped:
                module = stripped.split()[1].split(".", 1)[0]
            else:
                module = None

            if module and module not in _ALLOWED_IMPORTS:
                raise SandboxViolation(f"Import '{module}' not permitted")


def _simulate_market(agents: Sequence[Agent], jobs: Sequence[Job]) -> SimulationResults:
    gmv = 0.0
    total_cost = 0.0
    latencies: List[float] = []
    accepted = 0
    fairness_scores: List[float] = []

    for job in jobs:
        candidate_scores = [(agent, heuristics.score_match(agent, job)) for agent in agents]
        ranked_agents = heuristics.rank_candidates(candidate_scores)
        price = heuristics.price_job(job)
        team = heuristics.schedule_agents(ranked_agents, job)
        if not team:
            continue
        assignment_cost = sum(agent.cost for agent in team)
        gmv += price
        total_cost += assignment_cost
        latencies.append(max(0.1, job.urgency) / sum(agent.speed for agent in team))
        accepted += 1
        fairness_scores.append(sum(agent.reputation for agent in team) / max(len(team), 1))

    latency = statistics.fmean(latencies) if latencies else 0.0
    fairness = statistics.fmean(fairness_scores) if fairness_scores else 1.0
    acceptance_rate = accepted / len(jobs) if jobs else 0.0
    return SimulationResults(gmv=gmv, cost=total_cost, latency=latency, fairness=fairness, acceptance_rate=acceptance_rate)


class EvaluationHarness:
    """Executes staged evaluations for proposed diffs."""

    def __init__(self, baseline_metrics: Mapping[str, float]) -> None:
        self.baseline_metrics = baseline_metrics

    async def stage_one(self, diff: ProposedDiff) -> None:
        _sandbox_guard(diff)
        # Quick AST sanity by attempting apply without executing
        apply_diff(_load_source(), diff)

    async def stage_two(self, diff: ProposedDiff, *, agents: Sequence[Agent], jobs: Sequence[Job]) -> SimulationResults:
        source = _load_source()
        mutated_source = apply_diff(source, diff)
        with _monkeypatch_module(heuristics, mutated_source):
            return _simulate_market(agents, jobs)

    async def evaluate(self, diff: ProposedDiff, *, agents: Sequence[Agent], jobs: Sequence[Job]) -> Mapping[str, float]:
        await self.stage_one(diff)
        results = await self.stage_two(diff, agents=agents, jobs=jobs)
        return {
            "GMV": results.gmv,
            "Cost": results.cost,
            "Utility": results.utility,
            "Latency": results.latency,
            "Fairness": results.fairness,
            "Acceptance": results.acceptance_rate,
        }


def _load_source() -> str:
    import inspect

    return inspect.getsource(heuristics)


@contextlib.contextmanager
def _monkeypatch_module(module: ModuleType, source: str):
    import importlib
    import importlib.util
    import sys
    import types

    spec = importlib.util.spec_from_loader(module.__name__, loader=None)
    new_module = types.ModuleType(module.__name__)
    exec(compile(source, filename="<alphaevolve>", mode="exec"), new_module.__dict__)
    sys.modules[module.__name__] = new_module
    globals_ns = globals()
    previous = globals_ns.get("heuristics", module)
    globals_ns["heuristics"] = new_module
    try:
        yield new_module
    finally:
        sys.modules[module.__name__] = module
        globals_ns["heuristics"] = previous


__all__ = ["EvaluationHarness", "SimulationResults", "SandboxViolation"]
