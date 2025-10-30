"""Configuration dataclasses for the Tiny Recursive Model demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple


def _default_training_schedule() -> Tuple[int, ...]:
    """Return the default outer-step supervision weights.

    The weights emphasise early progress while still rewarding late
    refinements.  The tuple length is automatically adjusted at runtime based
    on ``outer_steps`` so callers rarely need to tweak it manually.
    """

    return (0.5, 0.3, 0.2)


@dataclass(slots=True)
class TinyRecursiveModelConfig:
    """Holds all tunable parameters for the TRM demo engine.

    The defaults are inspired by the "Less is More" paper and tuned for the
    AGI Jobs v0 (v2) environment so that a non-technical operator can obtain
    excellent results without manual hyper-parameter sweeps.
    """

    input_dim: int = 16
    latent_dim: int = 32
    answer_dim: int = 16
    hidden_dim: int = 64
    num_classes: int = 2
    inner_cycles: int = 6
    outer_steps: int = 3
    halt_threshold: float = 0.55
    max_recursions: int = 18
    ema_decay: float = 0.999
    learning_rate: float = 3e-4
    weight_decay: float = 1e-4
    batch_size: int = 128
    epochs: int = 6
    device: str = "cpu"
    supervision_weights: Tuple[int, ...] = field(default_factory=_default_training_schedule)

    def resolved_supervision_weights(self) -> Tuple[float, ...]:
        """Return a tuple with length ``outer_steps`` representing loss weights."""

        weights = self.supervision_weights
        if len(weights) == self.outer_steps:
            return weights
        if len(weights) > self.outer_steps:
            return weights[: self.outer_steps]
        # Pad and renormalise to keep the overall weight sum equal to 1.0.
        pad = self.outer_steps - len(weights)
        if pad > 0:
            weights = weights + (weights[-1],) * pad
        total = float(sum(weights))
        if total == 0:
            return tuple(1.0 / self.outer_steps for _ in range(self.outer_steps))
        return tuple(w / total for w in weights[: self.outer_steps])

    @property
    def total_possible_steps(self) -> int:
        """Return the maximum amount of recursive updates allowed."""

        return min(self.max_recursions, self.inner_cycles * self.outer_steps)

