"""Configuration objects for the HGM core engine."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class EngineConfig:
    """Runtime configuration for :class:`~hgm_core.engine.HGMEngine`.

    Attributes:
        widening_alpha: Exponent controlling tree widening. Children may only
            be expanded while ``len(children) <= visits ** widening_alpha``.
        min_visitations: Minimum virtual visits granted to each node before
            the widening rule is applied. This avoids ``0 ** alpha`` edge
            cases during the initial exploration steps.
        thompson_prior: Prior pseudo-count applied to success and failure
            counts for Thompson sampling. ``1.0`` corresponds to a uniform
            Beta prior.
        seed: Optional deterministic seed fed into the internal random number
            generator. When provided, the engine behaves deterministically –
            a requirement for reproducible unit tests.
    """

    widening_alpha: float = 0.5
    min_visitations: int = 1
    thompson_prior: float = 1.0
    seed: int | None = None
