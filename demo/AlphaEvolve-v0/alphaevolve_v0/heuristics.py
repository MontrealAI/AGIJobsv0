"""Baseline heuristics for the AlphaEvolve economic optimization demo.

The functions defined in this module implement the starting point heuristics that
AlphaEvolve improves.  Each evolvable decision surface is wrapped in EVOLVE-BLOCK
markers so the autonomous improvement loop can surgically mutate these sections
without touching owner-governed controls or safety invariants.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, List, Sequence

# Immutable system controls owned by the marketplace operator -----------------

AGI_JOBS_OPERATOR_ADDRESS = "0xA6c4d5f12cB10a9BfA1bFeD43Baa2d6D47b7Be51"
DEFAULT_OWNER_TREASURY_SPLIT = 0.27
DEFAULT_OPERATOR_SPREAD = 0.05


@dataclass(frozen=True)
class Agent:
    """Agent participating in the AGI Jobs marketplace."""

    agent_id: str
    reputation: float
    stake: float
    specialization: Sequence[str]
    reliability: float
    latency_ms: float
    cost_per_unit: float


@dataclass(frozen=True)
class Job:
    """Job request available in the marketplace."""

    job_id: str
    value: float
    required_skills: Sequence[str]
    urgency: float
    complexity: float
    max_latency_ms: float


@dataclass
class HeuristicContext:
    """Context shared across heuristic functions during evaluation."""

    owner_treasury_split: float = DEFAULT_OWNER_TREASURY_SPLIT
    operator_spread: float = DEFAULT_OPERATOR_SPREAD
    demand_index: float = 1.0
    supply_index: float = 1.0
    fairness_bias: float = 0.5
    latency_target_ms: float = 350.0
    recent_acceptance: float = 0.7
    recent_drop_rate: float = 0.08
    notes: dict[str, float] = field(default_factory=dict)


# Tunable heuristic parameters (AlphaEvolve mutates these) --------------------

REP_WEIGHT = 0.58
STAKE_WEIGHT = 0.28
SKILL_WEIGHT = 0.22
FAIRNESS_WEIGHT = 0.16
LATENCY_WEIGHT = 0.14
PRICE_MARKUP = 0.09
RISK_PENALTY = 0.08
SEQUENCE_URGENCY_WEIGHT = 0.42
SEQUENCE_COMPLEXITY_WEIGHT = 0.36
SEQUENCE_VALUE_WEIGHT = 0.22


# Helper utilities -------------------------------------------------------------

def _skill_overlap(agent: Agent, job: Job) -> float:
    if not agent.specialization:
        return 0.0
    overlap = len(set(agent.specialization) & set(job.required_skills))
    return overlap / max(len(agent.specialization), 1)


def _fairness_adjustment(agent: Agent, ctx: HeuristicContext) -> float:
    fairness_bias = ctx.fairness_bias
    if agent.reliability < 0.5:
        return -0.12 * (1 - agent.reliability) * (1 - fairness_bias)
    if agent.reliability > 0.85:
        return 0.08 * fairness_bias
    return 0.02 * fairness_bias


def _latency_penalty(agent: Agent, job: Job, ctx: HeuristicContext) -> float:
    threshold = min(job.max_latency_ms, ctx.latency_target_ms)
    if agent.latency_ms <= threshold:
        return 0.0
    return -LATENCY_WEIGHT * (agent.latency_ms - threshold) / max(threshold, 1)


def _demand_supply_pressure(ctx: HeuristicContext) -> float:
    if ctx.supply_index == 0:
        return 0.0
    return ctx.demand_index / ctx.supply_index


# Evolvable heuristics ---------------------------------------------------------

# EVOLVE-BLOCK-START: score_match heuristic
def score_match(agent: Agent, job: Job, ctx: HeuristicContext) -> float:
    """Score the suitability of an agent for a given job."""

    base = (
        agent.reputation * REP_WEIGHT
        + agent.stake * STAKE_WEIGHT
        + _skill_overlap(agent, job) * SKILL_WEIGHT
    )
    fairness_component = _fairness_adjustment(agent, ctx) * FAIRNESS_WEIGHT
    demand_pressure = _demand_supply_pressure(ctx)
    reliability_boost = agent.reliability * 0.18 * demand_pressure
    latency_component = _latency_penalty(agent, job, ctx)
    risk_adjustment = -RISK_PENALTY * ctx.recent_drop_rate
    score = base + fairness_component + reliability_boost + latency_component + risk_adjustment
    return max(score, 0.0)


# EVOLVE-BLOCK-END


# EVOLVE-BLOCK-START: price_job heuristic
def price_job(agent: Agent, job: Job, ctx: HeuristicContext) -> float:
    """Calculate the marketplace price for the agent to execute the job."""

    production_cost = agent.cost_per_unit * job.complexity
    value_alignment = job.value * 0.5 + job.urgency * 0.25
    demand_multiplier = max(0.8, min(1.4, 0.9 + _demand_supply_pressure(ctx) * 0.1))
    fairness_offset = (0.05 + ctx.owner_treasury_split * 0.02) * ctx.fairness_bias
    raw_price = production_cost + value_alignment * PRICE_MARKUP
    adjusted_price = raw_price * demand_multiplier + fairness_offset
    operator_fee = adjusted_price * ctx.operator_spread
    total_price = adjusted_price + operator_fee
    return max(total_price, production_cost * 1.05)


# EVOLVE-BLOCK-END


# EVOLVE-BLOCK-START: rank_candidates heuristic
def rank_candidates(job: Job, agents: Iterable[Agent], ctx: HeuristicContext) -> List[Agent]:
    """Rank agents for a given job using the score heuristic."""

    ranked = sorted(
        agents,
        key=lambda agent: (
            score_match(agent, job, ctx),
            agent.reliability,
            -agent.latency_ms,
        ),
        reverse=True,
    )
    return list(ranked)


# EVOLVE-BLOCK-END


# EVOLVE-BLOCK-START: sequence_jobs heuristic
def sequence_jobs(jobs: Sequence[Job], ctx: HeuristicContext) -> List[Job]:
    """Determine the order in which jobs should be processed."""

    return list(
        sorted(
            jobs,
            key=lambda job: (
                job.urgency * SEQUENCE_URGENCY_WEIGHT
                + job.complexity * SEQUENCE_COMPLEXITY_WEIGHT
                + job.value * SEQUENCE_VALUE_WEIGHT
                - max(0.0, job.max_latency_ms - ctx.latency_target_ms) * 0.001,
            ),
            reverse=True,
        )
    )


# EVOLVE-BLOCK-END


__all__ = [
    "Agent",
    "Job",
    "HeuristicContext",
    "score_match",
    "price_job",
    "rank_candidates",
    "sequence_jobs",
    "AGI_JOBS_OPERATOR_ADDRESS",
]
