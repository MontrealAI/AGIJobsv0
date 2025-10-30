"""Solver component for the Absolute Zero Reasoner demo."""
from __future__ import annotations

import ast
import textwrap
from dataclasses import dataclass, field
from typing import Dict, Iterable, List

from .config import DemoConfig
from .executor import SandboxExecutor
from .utils import ExecutionResult, Task, normalise_output, parse_json_payload


@dataclass
class TaskSolver:
    """Solve tasks deterministically while simulating TRR++ adjustments."""

    config: DemoConfig
    executor: SandboxExecutor
    temperature: float = field(init=False)

    def __post_init__(self) -> None:
        self.temperature = self.config.solver_temperature

    def solve(self, task: Task) -> ExecutionResult:
        """Produce the expected output for the provided task."""

        payload = parse_json_payload(task.input_payload)
        code = textwrap.dedent(
            f"""
            {task.program}

            def __azr_entry__(payload):
                fn = {self._get_callable_name(task.program)!r}
                return globals()[fn](payload)
            """
        )
        return self.executor.execute(code, payload)

    @staticmethod
    def _get_callable_name(program: str) -> str:
        tree = ast.parse(program)
        for node in tree.body:
            if isinstance(node, ast.FunctionDef):
                return node.name
        raise ValueError("Unable to determine callable name from program")

    def reward_adjust(self, success: bool) -> None:
        if success:
            self.temperature = max(0.15, self.temperature * 0.97)
        else:
            self.temperature = min(0.95, self.temperature * 1.08)
