"""Prompt construction utilities for AlphaEvolve."""
from __future__ import annotations

import json
import random
from dataclasses import dataclass
from typing import Iterable, Mapping

from .evaluation import EvaluationResult
from .program_db import ProgramEntry


@dataclass
class PromptConfig:
    explicit_context: str
    stochastic_templates: Mapping[str, list[str]]
    use_probability: float
    include_metrics: list[str]


class AlphaEvolvePromptBuilder:
    """Builds prompts following AlphaEvolve conventions."""

    def __init__(self, config: PromptConfig) -> None:
        self.config = config

    def build(self, current_code: str, current_metrics: EvaluationResult, prior_programs: Iterable[ProgramEntry]) -> str:
        sections: list[str] = []
        sections.append(self._context_block())
        sections.append(self._current_program_block(current_code, current_metrics))
        sections.extend(self._prior_programs_block(prior_programs))
        sections.append(self._instruction_block())
        return "\n\n".join(sections)

    def _context_block(self) -> str:
        lines = ["System role: You are an elite AlphaEvolve engineer refining AGIJobs heuristics."]
        lines.append(self.config.explicit_context)
        if random.random() < self.config.use_probability:
            options = self.config.stochastic_templates.get("task_intro", [])
            if options:
                lines.append(random.choice(options))
        return "\n".join(lines)

    def _current_program_block(self, code: str, metrics: EvaluationResult) -> str:
        metrics_payload = {
            key: getattr(metrics, key.lower()) if hasattr(metrics, key.lower()) else None
            for key in self.config.include_metrics
        }
        block = ["Current program metrics:", json.dumps(metrics_payload, indent=2), "Current evolvable code:", code]
        return "\n".join(block)

    def _prior_programs_block(self, prior_programs: Iterable[ProgramEntry]) -> list[str]:
        blocks: list[str] = []
        for program in prior_programs:
            snippet = program.code[:400]
            payload = {
                "generation": program.generation,
                "utility": program.metrics.utility,
                "origin": program.origin,
                "niche": program.niche,
            }
            blocks.append("Prior elite program:\n" + json.dumps(payload, indent=2) + "\nSnippet:\n" + snippet)
        return blocks

    def _instruction_block(self) -> str:
        instructions = [
            "Instructions:",
            "- Output improvements exclusively as SEARCH/REPLACE diff blocks.",
            "- Preserve function signatures and validation guardrails.",
            "- Provide cohesive changes; introduce all new variables alongside their usage.",
            "- Focus on raising Utility (GMV minus Cost) without violating fairness or latency constraints.",
        ]
        return "\n".join(instructions)

