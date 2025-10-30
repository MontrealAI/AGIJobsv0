from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


class TaskType(str, enum.Enum):
    DEDUCTION = "deduction"
    ABDUCTION = "abduction"
    INDUCTION = "induction"


@dataclass
class AZRTask:
    task_id: str
    task_type: TaskType
    program: str
    input_data: Any
    expected_output: Any
    description: str = ""
    examples: List[Dict[str, Any]] = field(default_factory=list)
    difficulty: float = 0.5

    def to_prompt_snippet(self) -> str:
        blocks = [
            "```python\n# program\n" + self.program.strip() + "\n```",
            "```json\n# input\n" + self._format_json(self.input_data) + "\n```",
            "```json\n# output\n" + self._format_json(self.expected_output) + "\n```",
        ]
        if self.description:
            blocks.append(f"<!-- description: {self.description.strip()} -->")
        if self.examples:
            example_lines = [
                "- input: " + self._format_json(example["input"]) + ", output: " + self._format_json(example["output"]) for example in self.examples
            ]
            blocks.append("<!-- examples: " + " | ".join(example_lines) + " -->")
        return "\n".join(blocks)

    @staticmethod
    def _format_json(data: Any) -> str:
        import json

        return json.dumps(data, ensure_ascii=False)


@dataclass
class TaskOutcome:
    task: AZRTask
    proposer_reward: float
    solver_reward: float
    economic_value: float
    solved: bool
    solver_output: Any
    format_ok: bool


@dataclass
class IterationSummary:
    index: int
    tasks: List[TaskOutcome]
    proposer_valid_rate: float
    solver_success_rate: float
    diversity_score: float
    thermostat_adjustment: Optional[str] = None
    sentinel_alerts: List[str] = field(default_factory=list)


__all__ = [
    "TaskType",
    "AZRTask",
    "TaskOutcome",
    "IterationSummary",
]
