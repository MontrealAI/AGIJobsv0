"""Task proposer for the Absolute Zero Reasoner demo."""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Iterable, List

from .config import DemoConfig
from .utils import Task


@dataclass
class TaskProposer:
    """Generate self-supervised tasks mimicking AZR behaviour.

    The implementation uses deterministic templates to guarantee reproducibility
    while still yielding varied tasks. It intentionally avoids LLM calls so the
    demo can run entirely offline for non-technical operators.
    """

    config: DemoConfig
    rng: random.Random = field(default_factory=random.Random)

    _deduction_templates: List[str] = field(
        default_factory=lambda: [
            "def scale_and_shift(x):\n    return (x['value'] * {factor}) + {offset}",
            "def running_total(x):\n    total = 0\n    for item in x['values']:\n        total += item\n    return total + {offset}",
            "def smooth_average(x):\n    values = x['values']\n    return sum(values) / max(1, len(values))",
        ]
    )

    def _render_template(self, template: str) -> str:
        factor = self.rng.randint(2, 9)
        offset = self.rng.randint(-5, 10)
        return template.format(factor=factor, offset=offset)

    def _make_input(self, program: str) -> str:
        if "values" in program:
            values = [self.rng.randint(1, 9) for _ in range(self.rng.randint(2, 4))]
            return {"values": values}
        return {"value": self.rng.randint(1, 9)}

    def _execute_reference(self, program: str, payload: dict) -> str:
        safe_builtins = {"range": range, "len": len, "sum": sum, "min": min, "max": max}
        local_env: dict = {}
        exec(program, {"__builtins__": safe_builtins}, local_env)
        func = next(iter(local_env.values()))
        result = func(payload)
        return json_dumps(result)

    def generate_batch(self) -> List[Task]:
        """Create a batch of validated tasks."""

        tasks: List[Task] = []
        for _ in range(self.config.batch_size):
            template = self.rng.choice(self._deduction_templates)
            program = self._render_template(template)
            payload = self._make_input(program)
            expected = self._execute_reference(program, payload)
            tasks.append(
                Task(
                    program=program,
                    input_payload=json_dumps(payload),
                    expected_output=expected,
                    task_type="deduction",
                    description="Economic optimisation micro-task",
                )
            )
        return tasks


def json_dumps(value: object) -> str:
    import json

    return json.dumps(value, sort_keys=True)
