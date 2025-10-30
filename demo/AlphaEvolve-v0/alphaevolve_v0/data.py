"""Deterministic datasets used by the AlphaEvolve demo simulations."""

from __future__ import annotations

from dataclasses import dataclass
from random import Random
from typing import List, Sequence

from .heuristics import Agent, HeuristicContext, Job


@dataclass(frozen=True)
class SimulationDataset:
    agents: Sequence[Agent]
    jobs: Sequence[Job]
    context: HeuristicContext


def _make_agents(rng: Random, count: int) -> List[Agent]:
    agents: List[Agent] = []
    skills = ["ml", "eth", "ops", "design", "security", "compliance", "growth"]
    for idx in range(count):
        skill_sample = [skills[(idx + offset) % len(skills)] for offset in range(3)]
        agent = Agent(
            agent_id=f"agent-{idx:02d}",
            reputation=round(0.45 + rng.random() * 0.5, 3),
            stake=round(0.2 + rng.random() * 0.6, 3),
            specialization=skill_sample,
            reliability=round(0.4 + rng.random() * 0.55, 3),
            latency_ms=round(220 + rng.random() * 260, 2),
            cost_per_unit=round(32 + rng.random() * 18, 2),
        )
        agents.append(agent)
    return agents


def _make_jobs(rng: Random, count: int) -> List[Job]:
    jobs: List[Job] = []
    skills = ["ml", "eth", "ops", "design", "security", "compliance", "growth"]
    for idx in range(count):
        job = Job(
            job_id=f"job-{idx:03d}",
            value=round(180 + rng.random() * 420, 2),
            required_skills=[skills[(idx + step * 2) % len(skills)] for step in range(2)],
            urgency=round(0.35 + rng.random() * 0.6, 3),
            complexity=round(1.2 + rng.random() * 2.5, 3),
            max_latency_ms=round(320 + rng.random() * 260, 2),
        )
        jobs.append(job)
    return jobs


def baseline_dataset(seed: int, *, agents: int = 18, jobs: int = 36) -> SimulationDataset:
    rng = Random(seed)
    dataset = SimulationDataset(
        agents=_make_agents(rng, agents),
        jobs=_make_jobs(rng, jobs),
        context=HeuristicContext(
            owner_treasury_split=0.27,
            operator_spread=0.05,
            demand_index=1.12,
            supply_index=0.94,
            fairness_bias=0.53,
            latency_target_ms=360.0,
            recent_acceptance=0.71,
            recent_drop_rate=0.082,
            notes={"seed": seed},
        ),
    )
    return dataset


def stress_dataset(seed: int) -> SimulationDataset:
    rng = Random(seed)
    dataset = SimulationDataset(
        agents=_make_agents(rng, 22),
        jobs=_make_jobs(rng, 54),
        context=HeuristicContext(
            owner_treasury_split=0.3,
            operator_spread=0.06,
            demand_index=1.24,
            supply_index=0.88,
            fairness_bias=0.48,
            latency_target_ms=340.0,
            recent_acceptance=0.66,
            recent_drop_rate=0.11,
            notes={"seed": seed, "scenario": "stress"},
        ),
    )
    return dataset


def shadow_dataset(seed: int) -> SimulationDataset:
    rng = Random(seed)
    dataset = SimulationDataset(
        agents=_make_agents(rng, 15),
        jobs=_make_jobs(rng, 30),
        context=HeuristicContext(
            owner_treasury_split=0.25,
            operator_spread=0.045,
            demand_index=1.05,
            supply_index=0.99,
            fairness_bias=0.56,
            latency_target_ms=355.0,
            recent_acceptance=0.74,
            recent_drop_rate=0.067,
            notes={"seed": seed, "scenario": "shadow"},
        ),
    )
    return dataset


__all__ = [
    "SimulationDataset",
    "baseline_dataset",
    "stress_dataset",
    "shadow_dataset",
]
