"""Task primitives for the Absolute Zero Reasoner demo."""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Dict, Iterable, List, Optional, Sequence
import random


class TaskType(str, Enum):
    """Enumeration of supported Absolute Zero Reasoner task modes."""

    DEDUCTION = "deduction"
    ABDUCTION = "abduction"
    INDUCTION = "induction"


@dataclass
class AZRTask:
    """Structured representation of a reasoning task.

    Attributes:
        identifier: Stable identifier for telemetry and reproducibility.
        task_type: Reasoning mode associated with the task.
        program: Python program implementing the hidden ground truth logic.
        input_payload: JSON-serialisable payload consumed by ``program``.
        expected_output: Expected solver output for deduction tasks.
        description: Human friendly description surfaced to the user.
        io_examples: Additional I/O examples supplied for induction tasks.
        metadata: Arbitrary metadata exposed to reward/telemetry engines.
    """

    identifier: str
    task_type: TaskType
    program: str
    input_payload: Dict[str, object]
    expected_output: object
    description: str
    io_examples: Sequence[Dict[str, object]] = field(default_factory=list)
    metadata: Dict[str, object] = field(default_factory=dict)


class TaskLibrary:
    """Curated catalogue of deterministic programmes for the demo.

    The library intentionally keeps tasks compact while covering
    all three reasoning modalities required by Absolute Zero.
    """

    def __init__(self, seed: Optional[int] = None) -> None:
        self._rng = random.Random(seed)
        self._tasks: List[AZRTask] = self._build_tasks()

    @staticmethod
    def _build_tasks() -> List[AZRTask]:
        """Return a deterministic suite of tasks."""

        deduction_program = """
from typing import Any

def solve(payload: dict) -> Any:
    numbers = payload["numbers"]
    factor = payload["factor"]
    return [n * factor for n in numbers]
""".strip()

        abduction_program = """
from typing import Any

def solve(payload: dict) -> Any:
    target = payload["target"]
    return target ** 2 + 3 * target + 5
""".strip()

        induction_program = """
from typing import Any

def solve(payload: dict) -> int:
    value = payload["value"]
    # Classic triangular number computation.
    return value * (value + 1) // 2
""".strip()

        tasks: List[AZRTask] = [
            AZRTask(
                identifier="deduction-linear-scale",
                task_type=TaskType.DEDUCTION,
                program=deduction_program,
                input_payload={"numbers": [1, 2, 3, 4], "factor": 3},
                expected_output=[3, 6, 9, 12],
                description="Scale a sequence of integers by a constant factor.",
                metadata={"difficulty": 0.2},
            ),
            AZRTask(
                identifier="abduction-invert-quadratic",
                task_type=TaskType.ABDUCTION,
                program=abduction_program,
                input_payload={"target": 5},
                expected_output=45,
                description="Discover the input that produces the observed quadratic output.",
                metadata={"difficulty": 0.5, "ground_truth_input": 5},
            ),
            AZRTask(
                identifier="induction-triangular",
                task_type=TaskType.INDUCTION,
                program=induction_program,
                input_payload={"value": 6},
                expected_output=21,
                description="Infer the closed form for the triangular number sequence.",
                io_examples=[
                    {"input": {"value": 1}, "output": 1},
                    {"input": {"value": 3}, "output": 6},
                    {"input": {"value": 5}, "output": 15},
                ],
                metadata={"difficulty": 0.7, "reference_program": induction_program},
            ),
        ]
        return tasks

    def sample(self, *, count: int, difficulty_bias: float = 0.0) -> List[AZRTask]:
        """Sample a batch of tasks modulated by difficulty."""

        if count <= 0:
            return []
        weights = []
        for task in self._tasks:
            base = 1.0 + difficulty_bias * (task.metadata.get("difficulty", 0.5) - 0.5)
            weights.append(max(base, 0.01))
        total = sum(weights)
        norm_weights = [w / total for w in weights]
        selections = self._rng.choices(self._tasks, weights=norm_weights, k=count)
        # Return shallow copies to avoid accidental mutation.
        return [replace(task) for task in selections]

    def iter_all(self) -> Iterable[AZRTask]:
        """Return deterministic iterator over tasks."""

        for task in self._tasks:
            yield replace(task)


__all__ = ["TaskType", "AZRTask", "TaskLibrary"]
