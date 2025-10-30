from __future__ import annotations

import itertools
import random
import uuid
from dataclasses import dataclass
from typing import List

from .buffers import TaskBuffer
from .tasks import AZRTask, TaskType


@dataclass
class ProposalResult:
    tasks: List[AZRTask]
    raw_text: str
    valid_count: int


class TaskProposer:
    def __init__(self, buffer: TaskBuffer, config: dict, rng: random.Random) -> None:
        self.buffer = buffer
        self.temperature = float(config.get("base_temperature", 0.7))
        self.max_loc = int(config.get("max_program_loc", 40))
        self.difficulty = float(config.get("min_difficulty", 0.2))
        self.min_difficulty = float(config.get("min_difficulty", 0.2))
        self.max_difficulty = float(config.get("max_difficulty", 1.0))
        self.difficulty_step = float(config.get("difficulty_step", 0.05))
        self.rng = rng
        self._cycle = itertools.cycle([TaskType.DEDUCTION, TaskType.ABDUCTION, TaskType.INDUCTION])

    def propose(self, batch_size: int) -> ProposalResult:
        tasks: List[AZRTask] = []
        text_fragments: List[str] = []
        valid_count = 0
        for _ in range(batch_size):
            task_type = next(self._cycle)
            task = self._generate_task(task_type)
            tasks.append(task)
            text_fragments.append(task.to_prompt_snippet())
            valid_count += 1
        return ProposalResult(tasks=tasks, raw_text="\n\n".join(text_fragments), valid_count=valid_count)

    def adjust_difficulty(self, delta: float) -> str:
        previous = self.difficulty
        self.difficulty = float(min(self.max_difficulty, max(self.min_difficulty, self.difficulty + delta)))
        return f"difficulty {previous:.2f} -> {self.difficulty:.2f}"

    def _generate_task(self, task_type: TaskType) -> AZRTask:
        task_id = str(uuid.uuid4())
        difficulty = max(self.min_difficulty, min(self.max_difficulty, self.difficulty + self.rng.uniform(-0.05, 0.05)))
        complexity = max(1, int(self.max_loc * difficulty / 4))
        if task_type is TaskType.DEDUCTION:
            n = max(2, int(5 + complexity))
            numbers = [self.rng.randint(1, 10) for _ in range(3)]
            program = (
                "import json\n"
                "import sys\n"
                "data = json.loads(sys.stdin.read())\n"
                f"result = (data['x'] + {numbers[0]}) * {numbers[1]} - {numbers[2]}\n"
                "print(json.dumps(result))\n"
            )
            input_data = {"x": self.rng.randint(0, n)}
            output = (input_data["x"] + numbers[0]) * numbers[1] - numbers[2]
            description = "Compute an affine transformation over integer inputs."
            return AZRTask(
                task_id=task_id,
                task_type=task_type,
                program=program,
                input_data=input_data,
                expected_output=output,
                description=description,
                difficulty=difficulty,
            )
        if task_type is TaskType.ABDUCTION:
            factor = self.rng.randint(2, 6)
            bias = self.rng.randint(1, 5)
            program = (
                "import json\n"
                "import sys\n"
                "data = json.loads(sys.stdin.read())\n"
                "x = data['x']\n"
                f"print(json.dumps({factor} * x + {bias}))\n"
            )
            solution = self.rng.randint(-10, 10)
            target_output = factor * solution + bias
            input_data = {"x": None}
            description = "Find an input value that satisfies the linear equation."
            examples = [
                {"input": {"x": 1}, "output": factor + bias},
                {"input": {"x": 2}, "output": 2 * factor + bias},
            ]
            return AZRTask(
                task_id=task_id,
                task_type=task_type,
                program=program,
                input_data=input_data,
                expected_output=target_output,
                description=description,
                examples=examples,
                difficulty=difficulty,
            )
        # Induction
        coeff = self.rng.randint(1, 4)
        program = (
            "import json\n"
            "import sys\n"
            "def transform(n: int) -> int:\n"
            f"    return {coeff} * n * n + n\n"
            "def main() -> None:\n"
            "    data = json.loads(sys.stdin.read())\n"
            "    values = []\n"
            "    for item in data['inputs']:\n"
            "        values.append(transform(item))\n"
            "    print(json.dumps(values))\n"
            "if __name__ == '__main__':\n"
            "    main()\n"
        )
        inputs = [self.rng.randint(1, 6) for _ in range(3)]
        outputs = [coeff * val * val + val for val in inputs]
        description = "Infer the polynomial that maps integer inputs to outputs."
        examples = [
            {"input": {"x": inputs[0]}, "output": outputs[0]},
            {"input": {"x": inputs[1]}, "output": outputs[1]},
            {"input": {"x": inputs[2]}, "output": outputs[2]},
        ]
        return AZRTask(
            task_id=task_id,
            task_type=task_type,
            program=program,
            input_data={"inputs": inputs},
            expected_output=outputs,
            description=description,
            examples=examples,
            difficulty=difficulty,
        )


__all__ = ["TaskProposer", "ProposalResult"]
