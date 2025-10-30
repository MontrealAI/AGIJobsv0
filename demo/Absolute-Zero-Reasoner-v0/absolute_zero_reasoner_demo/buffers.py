from __future__ import annotations

import collections
from typing import Deque, Dict, Iterable, List

from .tasks import AZRTask, TaskType


class TaskBuffer:
    def __init__(self, max_size: int) -> None:
        self.max_size = max_size
        self._buffers: Dict[TaskType, Deque[AZRTask]] = {
            TaskType.DEDUCTION: collections.deque(maxlen=max_size),
            TaskType.ABDUCTION: collections.deque(maxlen=max_size),
            TaskType.INDUCTION: collections.deque(maxlen=max_size),
        }

    def add(self, task: AZRTask) -> None:
        self._buffers[task.task_type].append(task)

    def sample(self, task_type: TaskType, limit: int = 2) -> List[AZRTask]:
        buffer = self._buffers[task_type]
        if not buffer:
            return []
        return list(list(buffer)[-limit:])

    def diversity_score(self) -> float:
        counts = [len(buf) for buf in self._buffers.values()]
        total = sum(counts)
        if total == 0:
            return 0.0
        proportions = [count / total for count in counts if count]
        if not proportions:
            return 0.0
        return 1.0 - sum(p * p for p in proportions)

    def __len__(self) -> int:
        return sum(len(buf) for buf in self._buffers.values())

    def iter_recent(self, task_type: TaskType, limit: int = 5) -> Iterable[AZRTask]:
        buffer = self._buffers[task_type]
        yield from list(buffer)[-limit:]


__all__ = ["TaskBuffer"]
