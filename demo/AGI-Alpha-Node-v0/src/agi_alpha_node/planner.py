from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List

from .config import PlannerConfig
from .knowledge import KnowledgeLake
from .logging_utils import json_log
from .metrics import MetricsRegistry


@dataclass
class PlanStep:
    job_id: str
    domain: str
    expected_reward: float
    confidence: float
    rationale: str


class Planner:
    def __init__(self, config: PlannerConfig, knowledge: KnowledgeLake, metrics: MetricsRegistry) -> None:
        self.config = config
        self.knowledge = knowledge
        self.metrics = metrics
        self._rng = random.Random(42)
        self._history: List[PlanStep] = []

    def _domain_modifier(self, domain: str) -> float:
        entries = self.knowledge.recent_summary(domain, limit=10)
        if not entries:
            return 1.0
        avg_value = sum(item["value"] for item in entries) / len(entries)
        return 1.0 + min(0.25, avg_value / 1000.0)

    def _exploration_bonus(self, job_id: str) -> float:
        seen = sum(1 for step in self._history if step.job_id == job_id)
        if seen == 0:
            return self.config.exploration_bias
        return self.config.exploitation_bias / (seen + 1)

    def _confidence(self, job: Dict[str, object]) -> float:
        base_confidence = 0.6 + self.config.risk_tolerance * 0.4
        domain = str(job.get("domain", ""))
        modifier = self._domain_modifier(domain)
        return max(0.1, min(0.99, base_confidence * modifier))

    def _score(self, job: Dict[str, object]) -> float:
        reward = float(job.get("reward", 0.0))
        confidence = self._confidence(job)
        exploration = self._exploration_bonus(str(job.get("job_id")))
        decay = self.config.reward_decay
        horizon_multiplier = (1 - decay ** self.config.horizon) / (1 - decay)
        score = reward * confidence * horizon_multiplier + exploration * reward * 0.01
        return score

    def plan(self, jobs: Iterable[Dict[str, object]]) -> List[PlanStep]:
        decisions: List[PlanStep] = []
        for job in jobs:
            job_id = str(job.get("job_id"))
            domain = str(job.get("domain"))
            score = self._score(job)
            confidence = self._confidence(job)
            rationale = (
                f"Projected {score:.2f} reward units over horizon {self.config.horizon} with confidence {confidence:.2%}."
            )
            decision = PlanStep(job_id=job_id, domain=domain, expected_reward=score, confidence=confidence, rationale=rationale)
            decisions.append(decision)
        decisions.sort(key=lambda d: d.expected_reward, reverse=True)
        self._history.extend(decisions[: self.config.horizon])
        self.metrics.set_gauge("agi_alpha_planner_expected_reward", sum(d.expected_reward for d in decisions))
        self.metrics.set_gauge("agi_alpha_planner_confidence", sum(d.confidence for d in decisions) / len(decisions or [1]))
        json_log("planner_plan", decisions=[decision.__dict__ for decision in decisions])
        return decisions

    def adjust_after_outcome(self, realised_reward: float) -> None:
        adjustment = math.tanh(realised_reward / 10000.0)
        self.config.risk_tolerance = max(0.1, min(0.95, self.config.risk_tolerance + adjustment * 0.01))
        self.metrics.set_gauge("agi_alpha_planner_risk_tolerance", self.config.risk_tolerance)
        json_log("planner_adjust", realised_reward=realised_reward, risk_tolerance=self.config.risk_tolerance)

    def diagnostics(self) -> Dict[str, object]:
        return {
            "horizon": self.config.horizon,
            "risk_tolerance": self.config.risk_tolerance,
            "history_length": len(self._history),
        }
