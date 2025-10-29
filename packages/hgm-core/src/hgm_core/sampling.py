"""Thompson sampling helpers used by the HGM engine."""

from __future__ import annotations

from dataclasses import dataclass
from random import Random
from typing import Sequence


@dataclass(slots=True)
class ThompsonSample:
    """Container for Thompson sampling draws.

    Attributes:
        arm: Identifier of the arm that was sampled.
        value: Sampled value from the posterior distribution.
    """

    arm: str
    value: float


class ThompsonSampler:
    """Beta-distribution based Thompson sampling helper.

    The sampler wraps :class:`random.Random` to ensure deterministic behaviour
    when seeded. The sampler expects Beta parameters expressed as success and
    failure pseudo counts.
    """

    def __init__(self, seed: int | None = None) -> None:
        self._rng = Random(seed)

    @staticmethod
    def validate_params(alpha: float, beta: float) -> None:
        if alpha <= 0 or beta <= 0:
            raise ValueError("Beta parameters must be positive")

    def beta(self, alpha: float, beta: float) -> float:
        """Draw a value from a Beta distribution."""

        self.validate_params(alpha, beta)
        return self._rng.betavariate(alpha, beta)

    def choose(self, arms: Sequence[str], alphas: Sequence[float], betas: Sequence[float]) -> ThompsonSample:
        """Sample the best arm according to Thompson sampling.

        Args:
            arms: Sequence of arm identifiers.
            alphas: Matching sequence of alpha parameters.
            betas: Matching sequence of beta parameters.
        """

        if not (len(arms) == len(alphas) == len(betas)):
            raise ValueError("Arms, alphas and betas must have matching lengths")
        if not arms:
            raise ValueError("At least one arm is required")

        best_sample = None
        for arm, alpha, beta in zip(arms, alphas, betas):
            value = self.beta(alpha, beta)
            if best_sample is None or value > best_sample.value:
                best_sample = ThompsonSample(arm=arm, value=value)
        assert best_sample is not None
        return best_sample


def posterior_parameters(successes: float, failures: float, prior: float) -> tuple[float, float]:
    """Return posterior Beta parameters for a Bernoulli reward model."""

    alpha = prior + successes
    beta = prior + failures
    ThompsonSampler.validate_params(alpha, beta)
    return alpha, beta
