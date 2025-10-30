"""LLM ensemble agent abstraction for AlphaEvolve."""
from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from typing import Iterable, Protocol

from .diffing import apply_diff


class DiffProposal(Protocol):
    origin: str
    diff_text: str


@dataclass
class Proposal:
    origin: str
    diff_text: str


class MutationStrategy(Protocol):
    async def propose(self, code: str, generation: int) -> Iterable[Proposal]:
        ...


class LocalHeuristicMutator:
    """Deterministic local strategy used for the demo when no LLM credentials are provided."""

    def __init__(self) -> None:
        self._sequence = [
            self._boost_reputation_weight,
            self._regional_bonus,
            self._latency_balancer,
        ]

    async def propose(self, code: str, generation: int) -> Iterable[Proposal]:
        index = min(generation, len(self._sequence) - 1)
        proposal_builder = self._sequence[index]
        return [Proposal(origin="local-mutator", diff_text=proposal_builder(code))]

    def _boost_reputation_weight(self, code: str) -> str:
        search_block = (
            "    score = (compat * 0.4) + (economic_strength * 0.4) + (urgency_alignment * 0.2)\n"
            "    adjusted_score = max(score - fairness_penalty, 0.0)"
        )
        replace_block = (
            "    cost_pressure = min(agent.cost_per_job / max(job.max_cost, 1), 1.0)\n"
            "    score = (compat * 0.36) + (economic_strength * 0.46) + (urgency_alignment * 0.18) - (cost_pressure * 0.2)\n"
            "    adjusted_score = max(score - fairness_penalty, 0.0)"
        )
        return f"<<<<<< SEARCH\n{search_block}\n======\n{replace_block}\n>>>>>> REPLACE"

    def _regional_bonus(self, code: str) -> str:
        if "(compat * 0.36) + (economic_strength * 0.46) + (urgency_alignment * 0.18)" in code:
            score_line = "    score = (compat * 0.36) + (economic_strength * 0.46) + (urgency_alignment * 0.18) - (cost_pressure * 0.2)"
        else:
            score_line = "    score = (compat * 0.4) + (economic_strength * 0.4) + (urgency_alignment * 0.2)"
        if "cost_pressure =" in code:
            cost_search = "\n    cost_pressure = min(agent.cost_per_job / max(job.max_cost, 1), 1.0)\n"
            cost_replace = cost_search
        else:
            cost_search = "\n"
            cost_replace = "    cost_pressure = min(agent.cost_per_job / max(job.max_cost, 1), 1.0)\n"
        search_block = (
            "fairness_penalty = FAIRNESS_PENALTY if agent.region != job.region else 0.0\n"
            f"{cost_search}"
            f"{score_line}\n"
            "    adjusted_score = max(score - fairness_penalty, 0.0)"
        )
        replace_block = (
            "fairness_penalty = FAIRNESS_PENALTY if agent.region != job.region else 0.0\n"
            "    regional_bonus = 0.02 if agent.region == job.region else 0.0\n"
            f"{cost_replace}"
            f"{score_line} + regional_bonus\n"
            "    adjusted_score = max(score - fairness_penalty, 0.0)"
        )
        return f"<<<<<< SEARCH\n{search_block}\n======\n{replace_block}\n>>>>>> REPLACE"

    def _latency_balancer(self, code: str) -> str:
        search = "if job.urgency > 0.6 and agent.reputation < 0.4:\n        base_latency *= 1.25"
        replace = (
            "if job.urgency > 0.6 and agent.reputation < 0.45:\n        base_latency *= 1.18\n    base_latency *= 1 - min(agent.reputation * 0.05, 0.15)"
        )
        return (
            "<<<<<< SEARCH\n"
            "if job.urgency > 0.6 and agent.reputation < 0.4:\n        base_latency *= 1.25\n"
            "======\n"
            "if job.urgency > 0.6 and agent.reputation < 0.45:\n        base_latency *= 1.18\n    base_latency *= 1 - min(agent.reputation * 0.05, 0.15)\n"
            ">>>>>> REPLACE"
        )


class AlphaEvolveAgent:
    """Coordinates multiple mutation strategies (fast vs strong models)."""

    def __init__(self, strategies: Iterable[MutationStrategy]) -> None:
        self._strategies = list(strategies)

    async def generate(self, code: str, generation: int) -> list[Proposal]:
        tasks = [strategy.propose(code, generation) for strategy in self._strategies]
        results: list[Proposal] = []
        for proposals in await asyncio.gather(*tasks):
            results.extend(proposals)
        return results

