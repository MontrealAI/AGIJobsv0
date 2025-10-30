from __future__ import annotations

import json
import random
from dataclasses import dataclass
from typing import Any, Dict, Optional

from .executor import ExecutionResult, NonDeterministicProgram, SafeExecutor, SandboxViolation
from .tasks import AZRTask, TaskType


@dataclass
class SolveResult:
    solved: bool
    output: Any
    format_ok: bool
    execution: Optional[ExecutionResult] = None
    error: Optional[str] = None


class TaskSolver:
    def __init__(self, executor: SafeExecutor, config: dict, rng: random.Random) -> None:
        self.executor = executor
        self.temperature = float(config.get("base_temperature", 0.6))
        self.accuracy_floor = float(config.get("accuracy_floor", 0.3))
        self.accuracy_ceiling = float(config.get("accuracy_ceiling", 0.95))
        self.improvement_rate = float(config.get("improvement_rate", 0.08))
        self.accuracy_state: Dict[TaskType, float] = {
            TaskType.DEDUCTION: self.accuracy_floor,
            TaskType.ABDUCTION: self.accuracy_floor,
            TaskType.INDUCTION: self.accuracy_floor,
        }
        self.rng = rng

    def adjust_accuracy(self, task_type: TaskType, advantage: float) -> None:
        baseline = self.accuracy_state[task_type]
        delta = self.improvement_rate * advantage
        new_value = max(self.accuracy_floor, min(self.accuracy_ceiling, baseline + delta))
        self.accuracy_state[task_type] = new_value

    def solve(self, task: AZRTask) -> SolveResult:
        try:
            if task.task_type is TaskType.DEDUCTION:
                exec_result = self.executor.execute_deterministic(task.program, task.input_data)
                candidate = exec_result.output
                solved = self._maybe_corrupt_answer(task.task_type, candidate)
                return SolveResult(solved=solved, output=candidate if solved else "__incorrect__", format_ok=True, execution=exec_result)
            if task.task_type is TaskType.ABDUCTION:
                target = task.expected_output
                candidate_input = self._solve_abduction(task, target)
                if candidate_input is None:
                    return SolveResult(solved=False, output=None, format_ok=True, error="no-solution")
                payload = {"x": candidate_input}
                exec_result = self.executor.execute_deterministic(task.program, payload)
                if exec_result.output == target:
                    solved = self._maybe_corrupt_answer(task.task_type, payload)
                    return SolveResult(solved=solved, output=payload if solved else None, format_ok=True, execution=exec_result)
                return SolveResult(solved=False, output=payload, format_ok=True, execution=exec_result)
            # induction
            program = self._synthesise_program(task)
            if program is None:
                return SolveResult(solved=False, output=None, format_ok=False, error="unable-to-synthesise")
            exec_result = self.executor.execute_deterministic(program, task.input_data)
            solved = exec_result.output == task.expected_output
            solved = solved and self._maybe_corrupt_answer(task.task_type, solved)
            return SolveResult(solved=solved, output=program if solved else "", format_ok=True, execution=exec_result)
        except (SandboxViolation, NonDeterministicProgram) as exc:
            return SolveResult(solved=False, output=None, format_ok=False, error=str(exc))
        except Exception as exc:  # pylint: disable=broad-except
            return SolveResult(solved=False, output=None, format_ok=False, error=str(exc))

    def _maybe_corrupt_answer(self, task_type: TaskType, answer: Any) -> bool:
        accuracy = self.accuracy_state[task_type]
        if self.rng.random() <= accuracy:
            return True
        return False

    def _solve_abduction(self, task: AZRTask, target: Any) -> Optional[int]:
        if task.examples and len(task.examples) >= 2:
            try:
                first = task.examples[0]["output"]
                second = task.examples[1]["output"]
                factor = second - first
                bias = first - factor
                candidate = (target - bias) / factor if factor else None
                if candidate is not None and abs(candidate - round(candidate)) < 1e-6:
                    return int(round(candidate))
            except Exception:  # pylint: disable=broad-except
                pass
        for candidate in range(-50, 51):
            payload = {"x": candidate}
            try:
                exec_result = self.executor.execute_deterministic(task.program, payload)
            except Exception:  # pylint: disable=broad-except
                return None
            if exec_result.output == target:
                return candidate
        return None

    def _synthesise_program(self, task: AZRTask) -> Optional[str]:
        examples = task.examples
        if not examples:
            return None
        if not all("input" in ex and "output" in ex for ex in examples):
            return None
        # assume polynomial of form a*n*n + n
        diffs = []
        for ex in examples:
            inp = ex["input"].get("x")
            out = ex["output"]
            if inp in (None, 0):
                continue
            coeff = (out - inp) / (inp * inp)
            diffs.append(coeff)
        if not diffs:
            return None
        coeff = round(sum(diffs) / len(diffs))
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
        return program


__all__ = ["TaskSolver", "SolveResult"]
