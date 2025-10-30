"""Marketplace heuristics annotated with EVOLVE-BLOCK markers for AlphaEvolve."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List


@dataclass(frozen=True)
class AgentProfile:
    """Snapshot of an agent participating in the AGI Jobs marketplace."""

    agent_id: str
    reputation: float
    stake: float
    cost_per_job: float
    specialization: set[str]
    region: str


@dataclass(frozen=True)
class JobListing:
    """Job request that must be matched to an agent."""

    job_id: str
    value: float
    urgency: float
    required_skills: set[str]
    region: str
    max_cost: float


REP_WEIGHT = 0.55
STAKE_WEIGHT = 0.25
URGENCY_WEIGHT = 0.2
FAIRNESS_PENALTY = 0.05
PRICE_SAFETY_MARGIN = 0.08
LATENCY_BASE = 1.2


def compatibility(agent: AgentProfile, job: JobListing) -> float:
    """Measures the skill overlap between an agent and a job."""

    if not agent.specialization or not job.required_skills:
        return 0.5
    overlap = len(agent.specialization & job.required_skills)
    return overlap / max(len(job.required_skills), 1)


# EVOLVE-BLOCK-START: score_match heuristic
def score_match(agent: AgentProfile, job: JobListing) -> float:
    """Scores how suitable an agent is for a particular job."""

    compat = compatibility(agent, job)
    economic_strength = (agent.reputation * REP_WEIGHT) + (agent.stake * STAKE_WEIGHT)
    urgency_alignment = job.urgency * URGENCY_WEIGHT
    fairness_penalty = FAIRNESS_PENALTY if agent.region != job.region else 0.0

    score = (compat * 0.4) + (economic_strength * 0.4) + (urgency_alignment * 0.2)
    adjusted_score = max(score - fairness_penalty, 0.0)
    return adjusted_score


# EVOLVE-BLOCK-END


# EVOLVE-BLOCK-START: price_job heuristic
def price_job(job: JobListing, demand_index: float) -> float:
    """Determines the reserve price for a job based on demand and urgency."""

    base_price = job.value * (1 - PRICE_SAFETY_MARGIN)
    urgency_boost = 1 + (job.urgency * 0.1)
    demand_boost = 1 + (demand_index * 0.05)
    return min(base_price * urgency_boost * demand_boost, job.max_cost)


# EVOLVE-BLOCK-END


# EVOLVE-BLOCK-START: rank_candidates heuristic
def rank_candidates(job: JobListing, agents: Iterable[AgentProfile]) -> List[AgentProfile]:
    """Ranks agents for a job using the score_match heuristic."""

    sorted_agents = sorted(agents, key=lambda agent: score_match(agent, job), reverse=True)
    return sorted_agents[:5]


# EVOLVE-BLOCK-END


# EVOLVE-BLOCK-START: estimate_latency heuristic
def estimate_latency(agent: AgentProfile, job: JobListing) -> float:
    """Rudimentary latency estimator to support evaluation metrics."""

    base_latency = LATENCY_BASE
    if job.region != agent.region:
        base_latency *= 1.35
    if job.urgency > 0.6 and agent.reputation < 0.4:
        base_latency *= 1.25
    return base_latency


# EVOLVE-BLOCK-END
