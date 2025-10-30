from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Iterable, List, Mapping, Sequence

from .llm import PromptPacket
from .program_db import ProgramRecord


@dataclass(slots=True)
class PromptBuilder:
    explicit_context: str
    include_metrics: Sequence[str]
    stochastic_templates: Mapping[str, object]
    _rng: random.Random = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        self._rng = random.Random()

    def seed(self, seed: int) -> None:
        self._rng.seed(seed)

    def _stochastic_intro(self) -> str:
        templates = self.stochastic_templates.get("task_intro", [])
        use_prob = float(self.stochastic_templates.get("use_probability", 0))
        if templates and self._rng.random() < use_prob:
            return str(self._rng.choice(list(templates)))
        return "Elevate the economic utility of the marketplace."

    def _extract_weight(self, parents: Sequence[ProgramRecord]) -> float:
        for parent in parents:
            if "urgency_weight" in parent.code:
                for line in parent.code.splitlines():
                    if "urgency_weight" in line and "=" in line:
                        try:
                            return float(line.split("=")[-1].strip())
                        except ValueError:
                            continue
        return 0.15

    def build(self, generation: int, parents: Sequence[ProgramRecord], current_metrics: Mapping[str, float]) -> PromptPacket:
        intro = self._stochastic_intro()
        parent_sections = []
        for parent in parents:
            metrics_repr = ", ".join(f"{metric}={parent.metrics.get(metric, 0):.3f}" for metric in self.include_metrics)
            parent_sections.append(f"- Gen {parent.generation} ({metrics_repr})")
        current_section = ", ".join(f"{metric}={current_metrics.get(metric, 0):.3f}" for metric in self.include_metrics)
        baseline_weight = self._extract_weight(parents)

        prompt = (
            f"System: {self.explicit_context}\n"
            f"Instruction: {intro}\n"
            f"Current metrics: {current_section}\n"
            f"Prior elite summaries:\n" + "\n".join(parent_sections)
        )

        # Provide heuristics weight metadata for deterministic scripted client
        metadata = {
            "search": "    urgency_weight = 0.15",
            "replace_template": "    urgency_weight = {weight}",
            "baseline_weight": baseline_weight,
        }
        return PromptPacket(prompt=prompt, metadata=metadata)


__all__ = ["PromptBuilder"]
