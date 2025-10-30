"""Synthetic dataset for demonstrating TRM reasoning."""
from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence, Tuple

import numpy as np
import torch
from torch.utils.data import Dataset


@dataclass
class Operation:
    op: str
    arg: int


@dataclass
class OperationSequence:
    start: int
    operations: Sequence[Operation]
    target: int
    partial_targets: Sequence[int]


def _load_vocab(path: str | Path) -> dict[str, int]:
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _apply_operation(value: int, operation: Operation) -> int:
    if operation.op == "add":
        value = value + operation.arg
    elif operation.op == "subtract":
        value = value - operation.arg
    elif operation.op == "multiply":
        value = value * operation.arg
    elif operation.op == "max":
        value = max(value, operation.arg)
    elif operation.op == "min":
        value = min(value, operation.arg)
    return max(0, min(199, value))


def _generate_operations(
    *,
    rng: random.Random,
    max_length: int,
    operand_range: Tuple[int, int],
) -> List[Operation]:
    operations: List[Operation] = []
    op_types = ["add", "subtract", "multiply", "max", "min"]
    for _ in range(rng.randint(2, max_length)):
        op = rng.choice(op_types)
        arg = rng.randint(*operand_range)
        if op == "multiply":
            arg = max(1, min(5, arg))
        operations.append(Operation(op, arg))
    return operations


def generate_sequence(
    *,
    rng: random.Random,
    max_length: int = 4,
    operand_range: Tuple[int, int] = (1, 9),
    start_range: Tuple[int, int] = (0, 10),
) -> OperationSequence:
    start = rng.randint(*start_range)
    operations = _generate_operations(
        rng=rng, max_length=max_length, operand_range=operand_range
    )
    partial_values: List[int] = []
    current = start
    for op in operations:
        current = _apply_operation(current, op)
        partial_values.append(current)
    return OperationSequence(
        start=start,
        operations=operations,
        target=current,
        partial_targets=tuple(partial_values),
    )


class OperationSequenceDataset(Dataset[dict[str, torch.Tensor]]):
    """PyTorch dataset for TRM training."""

    def __init__(
        self,
        *,
        size: int,
        vocab_path: str | Path,
        max_length: int = 4,
        seed: int = 0,
        start_range: Tuple[int, int] = (0, 10),
        operand_range: Tuple[int, int] = (1, 9),
    ) -> None:
        self.vocab = _load_vocab(vocab_path)
        self.max_length = max_length
        self.rng = random.Random(seed)
        self.sequences = [
            generate_sequence(
                rng=self.rng,
                max_length=max_length,
                operand_range=operand_range,
                start_range=start_range,
            )
            for _ in range(size)
        ]
        self.answer_dim = 200

    def __len__(self) -> int:
        return len(self.sequences)

    def _encode_step(self, operation: Operation) -> np.ndarray:
        vector = np.zeros(len(self.vocab) + 1, dtype=np.float32)
        vector[self.vocab[operation.op]] = 1.0
        vector[-1] = operation.arg / 10.0
        return vector

    def _pad_sequence(self, steps: List[np.ndarray]) -> np.ndarray:
        padding = np.zeros((self.max_length - len(steps), len(steps[0])), dtype=np.float32)
        return np.concatenate([np.stack(steps, axis=0), padding], axis=0)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        sequence = self.sequences[index]
        steps = [self._encode_step(op) for op in sequence.operations]
        encoded = self._pad_sequence(steps)
        partials = list(sequence.partial_targets)
        # pad partial targets
        partials += [sequence.target] * (self.max_length - len(partials))

        return {
            "start": torch.tensor([sequence.start], dtype=torch.float32),
            "steps": torch.tensor(encoded, dtype=torch.float32),
            "length": torch.tensor(len(sequence.operations), dtype=torch.long),
            "target": torch.tensor(sequence.target, dtype=torch.long),
            "partials": torch.tensor(partials, dtype=torch.long),
        }


__all__ = [
    "OperationSequence",
    "OperationSequenceDataset",
    "generate_sequence",
]
