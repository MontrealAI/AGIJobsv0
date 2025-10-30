"""Synthetic LLM ensemble for the AlphaEvolve demo."""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass
from typing import List, Mapping

from .diff_engine import DiffProposal, extract_parameters, render_parameter_diff

PARAM_BOUNDS = {
    "REP_WEIGHT": (0.2, 1.2),
    "STAKE_WEIGHT": (0.1, 0.7),
    "SKILL_WEIGHT": (0.05, 0.6),
    "FAIRNESS_WEIGHT": (0.05, 0.55),
    "LATENCY_WEIGHT": (0.05, 0.45),
    "PRICE_MARKUP": (0.02, 0.25),
    "RISK_PENALTY": (0.02, 0.3),
    "SEQUENCE_URGENCY_WEIGHT": (0.2, 0.8),
    "SEQUENCE_COMPLEXITY_WEIGHT": (0.1, 0.6),
    "SEQUENCE_VALUE_WEIGHT": (0.1, 0.5),
}


@dataclass(slots=True)
class CandidateContext:
    source: str
    metrics: Mapping[str, float]


class SyntheticModel:
    def __init__(self, name: str, *, seed: int) -> None:
        self._name = name
        self._rng = random.Random(seed)

    @property
    def name(self) -> str:
        return self._name

    def propose(self, context: CandidateContext, temperature: float) -> DiffProposal:
        raise NotImplementedError

    def _mutate_parameter(self, params: dict[str, float], key: str, delta: float) -> None:
        lower, upper = PARAM_BOUNDS[key]
        original = params[key]
        candidate = round(min(upper, max(lower, original + delta)), 2)
        if abs(candidate - original) < 0.005:
            step = 0.01 if delta >= 0 else -0.01
            candidate = round(min(upper, max(lower, original + step)), 2)
        params[key] = candidate


class FastModel(SyntheticModel):
    def propose(self, context: CandidateContext, temperature: float) -> DiffProposal:
        params = extract_parameters(context.source)
        param_keys = [key for key in params if key in PARAM_BOUNDS]
        key = self._rng.choice(param_keys) if param_keys else None
        if key is None:
            raise ValueError("No evolvable parameters found")
        delta = (self._rng.uniform(-0.12, 0.12)) * max(0.25, temperature)
        self._mutate_parameter(params, key, delta)
        if self._rng.random() < 0.4:
            second_key = self._rng.choice(param_keys)
            if second_key != key:
                self._mutate_parameter(params, second_key, delta * 0.5)
        identifier = f"fast-{uuid.uuid4().hex[:8]}"
        diff = render_parameter_diff(identifier, previous=extract_parameters(context.source), updated=params)
        diff.origin = self.name
        diff.metadata = {"temperature": temperature, "primary_parameter": key}
        return diff


class StrongModel(SyntheticModel):
    def propose(self, context: CandidateContext, temperature: float) -> DiffProposal:
        params = extract_parameters(context.source)
        utility = context.metrics.get("Utility", 0.0)
        fairness = context.metrics.get("Fairness", 0.0)
        risk = context.metrics.get("Risk", 0.0)
        adjustments = {
            "REP_WEIGHT": 0.08 * (1.0 - fairness),
            "SKILL_WEIGHT": 0.11 * (1.0 - fairness),
            "FAIRNESS_WEIGHT": 0.07 * (1.0 - fairness),
            "RISK_PENALTY": -0.08 * (0.12 - min(0.12, risk)),
            "PRICE_MARKUP": -0.05 * (temperature - 0.35),
            "SEQUENCE_VALUE_WEIGHT": 0.06 * (1.0 - fairness),
        }
        for key, delta in adjustments.items():
            self._mutate_parameter(params, key, delta)
        identifier = f"strong-{uuid.uuid4().hex[:8]}"
        diff = render_parameter_diff(identifier, previous=extract_parameters(context.source), updated=params)
        diff.origin = self.name
        diff.metadata = {
            "temperature": temperature,
            "strategy": "utility-fairness-balance",
            "baseline_utility": utility,
        }
        return diff


class AlphaEvolveAgent:
    def __init__(self, config: Mapping[str, object]) -> None:
        models_cfg = config.get("models", {})
        self._fast_model = FastModel(models_cfg.get("fast_model", "fast"), seed=9011)
        self._strong_model = StrongModel(models_cfg.get("strong_model", "strong"), seed=741)
        self._fast_mutations = int(models_cfg.get("fast_mutations_per_cycle", 4))
        self._strong_ratio = float(models_cfg.get("strong_invoke_ratio", 0.2))
        self._rng = random.Random(1337)

    def generate(
        self,
        context: CandidateContext,
        *,
        temperature: float,
    ) -> List[DiffProposal]:
        proposals: List[DiffProposal] = []
        for _ in range(self._fast_mutations):
            proposals.append(self._fast_model.propose(context, temperature))
        if self._rng.random() < self._strong_ratio:
            proposals.append(self._strong_model.propose(context, temperature))
        return proposals


__all__ = ["AlphaEvolveAgent", "CandidateContext"]
