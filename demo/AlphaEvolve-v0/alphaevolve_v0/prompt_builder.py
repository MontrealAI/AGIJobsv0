"""Prompt assembly for AlphaEvolve synthetic LLM agents."""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from textwrap import indent
from typing import Mapping, Sequence

from .diff_engine import extract_evolve_blocks


@dataclass(frozen=True)
class PriorSolution:
    identifier: str
    diff_summary: str
    metrics: Mapping[str, float]


class PromptBuilder:
    def __init__(self, config: Mapping[str, object]) -> None:
        self._config = config

    def build(
        self,
        *,
        current_source: str,
        current_metrics: Mapping[str, float],
        prior_solutions: Sequence[PriorSolution],
        temperature: float,
    ) -> str:
        context = self._config.get("explicit_context", "")
        include_metrics = self._config.get("include_metrics", [])
        pieces: list[str] = []
        pieces.append("SYSTEM: You are AlphaEvolve — an elite AGI Jobs improvement architect.")
        if context:
            pieces.append(f"CONTEXT: {context}")
        if include_metrics:
            metric_snapshot = {name: round(current_metrics.get(name, 0.0), 6) for name in include_metrics}
            pieces.append(f"CURRENT METRICS: {json.dumps(metric_snapshot, sort_keys=True)}")
        pieces.append(f"TEMPERATURE: {temperature:.3f}")
        stochastic_cfg = self._config.get("stochastic_templates")
        if stochastic_cfg and random.random() < float(stochastic_cfg.get("use_probability", 0)):
            template = random.choice(list(stochastic_cfg.get("task_intro", [])))
            if template:
                pieces.append(f"MOTIVATION: {template}")
        if prior_solutions:
            limit = int(self._config.get("max_prior_solutions", len(prior_solutions)))
            for solution in list(prior_solutions)[-limit:]:
                pieces.append(
                    "PRIOR SOLUTION:\n"
                    + indent(solution.diff_summary.strip(), "    ")
                    + "\nMETRICS: "
                    + json.dumps(solution.metrics, sort_keys=True)
                )
        pieces.append("CURRENT PROGRAM EVOLVE BLOCKS:")
        for name, block in extract_evolve_blocks(current_source).items():
            pieces.append(f"-- {name} --\n" + indent(block.strip(), "    "))
        pieces.append(
            "TASK: Suggest SEARCH/REPLACE diff blocks that expand Utility, GMV, fairness, and reduce risk."
        )
        pieces.append("RULES: output only diff blocks; declare new identifiers if introduced; respect safety constraints.")
        return "\n\n".join(pieces)


__all__ = ["PromptBuilder", "PriorSolution"]
