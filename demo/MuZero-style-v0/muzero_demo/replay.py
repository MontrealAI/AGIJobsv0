"""Replay buffer for MuZero demo."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, Iterable, List, Tuple
import random


@dataclass
class Transition:
    observation: List[float]
    action: int
    reward: float
    policy: List[float]
    value: float


class ReplayBuffer:
    def __init__(self, capacity: int) -> None:
        self.capacity = capacity
        self.buffer: Deque[Transition] = deque(maxlen=capacity)

    def push(self, transition: Transition) -> None:
        self.buffer.append(transition)

    def sample(self, batch_size: int) -> List[Transition]:
        if batch_size >= len(self.buffer):
            return list(self.buffer)
        return random.sample(list(self.buffer), batch_size)

    def __len__(self) -> int:
        return len(self.buffer)

    def extend_episode(self, episode: Iterable[Transition]) -> None:
        for step in episode:
            self.push(step)
