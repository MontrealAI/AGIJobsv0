"""Synthetic reasoning curriculum for the Tiny Recursive Model demo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Tuple

import numpy as np


@dataclass
class ReasoningSample:
    features: np.ndarray
    label: int


class ReasoningDataset:
    """Generates small reasoning puzzles requiring recursive refinement."""

    def __init__(self, seed: int = 0) -> None:
        self.random = np.random.default_rng(seed)
        self.samples: List[ReasoningSample] = []

    def generate(self, n_samples: int) -> None:
        """Populate the dataset with parity and carry-reasoning problems."""

        for _ in range(n_samples):
            digits = self.random.integers(low=0, high=10, size=3)
            carry_target = int(digits[0] + digits[1] + digits[2] >= 15)
            parity = int((digits.sum() % 2) == 0)
            label = 1 if carry_target ^ parity else 0
            norm_digits = digits / 10.0
            engineered = np.array([
                digits[0] > digits[1],
                digits[1] > digits[2],
                digits[2] > digits[0],
                parity,
                carry_target,
            ], dtype=float)
            features = np.concatenate([norm_digits, engineered])
            self.samples.append(ReasoningSample(features=features, label=label))

    def as_arrays(self) -> Tuple[np.ndarray, np.ndarray]:
        features = np.stack([sample.features for sample in self.samples])
        labels = np.array([sample.label for sample in self.samples])
        return features, labels

    def split(self, validation_split: float) -> Tuple["ReasoningDataset", "ReasoningDataset"]:
        total = len(self.samples)
        if total == 0:
            raise ValueError("Dataset is empty; call generate() first")
        indices = np.arange(total)
        self.random.shuffle(indices)
        split_idx = int(total * (1.0 - validation_split))
        train_idx, val_idx = indices[:split_idx], indices[split_idx:]
        train_ds = ReasoningDataset(seed=self.random.integers(0, 2**32 - 1))
        val_ds = ReasoningDataset(seed=self.random.integers(0, 2**32 - 1))
        train_ds.samples = [self.samples[i] for i in train_idx]
        val_ds.samples = [self.samples[i] for i in val_idx]
        return train_ds, val_ds

    def batches(self, batch_size: int) -> Iterable[Tuple[np.ndarray, np.ndarray]]:
        features, labels = self.as_arrays()
        total = len(labels)
        for start in range(0, total, batch_size):
            end = min(start + batch_size, total)
            yield features[start:end], labels[start:end]
