"""Baseline heuristics instrumented with EVOLVE-BLOCK annotations.

These heuristics are intentionally lightweight so AlphaEvolve can mutate them
safely without altering unrelated logic.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List


@dataclass(slots=True)
class Agent:
    id: str
    reputation: float
    stake: float
    cost: float
    speed: float
    speciality: str


@dataclass(slots=True)
class Job:
    id: str
    reward: float
    difficulty: float
    urgency: float
    speciality: str


def sigmoid(x: float) -> float:
    import math

    return 1 / (1 + math.exp(-x))


# EVOLVE-BLOCK-START: score_match heuristic
def score_match(agent: Agent, job: Job) -> float:
    reputation_weight = 0.45
    stake_weight = 0.2
    urgency_weight = 0.15
    speciality_bonus = 0.2 if agent.speciality == job.speciality else -0.05

    score = (
        agent.reputation * reputation_weight
        + agent.stake * stake_weight
        + sigmoid(job.urgency - job.difficulty) * urgency_weight
        + speciality_bonus
        - agent.cost * 0.05
    )
    return max(score, 0.0)


# EVOLVE-BLOCK-END


# EVOLVE-BLOCK-START: price_job heuristic
def price_job(job: Job) -> float:
    base_price = job.reward
    urgency_multiplier = 1 + sigmoid(job.urgency - 0.5)
    difficulty_multiplier = 1 + sigmoid(job.difficulty - 0.7)
    return base_price * urgency_multiplier * difficulty_multiplier


# EVOLVE-BLOCK-END


# EVOLVE-BLOCK-START: rank_candidates heuristic
def rank_candidates(agent_scores: Iterable[tuple[Agent, float]]) -> List[Agent]:
    ranked = sorted(agent_scores, key=lambda pair: pair[1], reverse=True)
    return [agent for agent, _ in ranked[:5]]


# EVOLVE-BLOCK-END


# EVOLVE-BLOCK-START: scheduling heuristic
def schedule_agents(agents: Iterable[Agent], job: Job) -> List[Agent]:
    shortlisted = [a for a in agents if a.speciality == job.speciality]
    if not shortlisted:
        shortlisted = list(agents)
    shortlisted.sort(key=lambda agent: agent.cost / max(agent.speed, 0.1))
    return shortlisted[:3]


# EVOLVE-BLOCK-END


__all__ = [
    "Agent",
    "Job",
    "score_match",
    "price_job",
    "rank_candidates",
    "schedule_agents",
]
