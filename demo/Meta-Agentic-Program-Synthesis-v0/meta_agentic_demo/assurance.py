"""Independent verification utilities for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal, getcontext
from statistics import pstdev
from typing import Iterable, Sequence


@dataclass(frozen=True)
class AuditResult:
    """Captures independent verification metrics."""

    precision_score: float
    variance_ratio: float
    spectral_ratio: float
    pass_precision: bool
    pass_variance: bool
    pass_spectral: bool


class IndependentAuditor:
    """Secondary verification engine that challenges the primary scorer."""

    def __init__(
        self,
        *,
        baseline_error: float,
        precision_tolerance: float,
        variance_ratio_ceiling: float,
        spectral_energy_ceiling: float,
        decimal_precision: int = 48,
    ) -> None:
        if baseline_error <= 0:
            raise ValueError("baseline_error must be positive")
        if precision_tolerance < 0:
            raise ValueError("precision_tolerance must be non-negative")
        if variance_ratio_ceiling <= 0:
            raise ValueError("variance_ratio_ceiling must be positive")
        if spectral_energy_ceiling <= 0:
            raise ValueError("spectral_energy_ceiling must be positive")
        self._baseline_error = baseline_error
        self._precision_tolerance = precision_tolerance
        self._variance_ratio_ceiling = variance_ratio_ceiling
        self._spectral_energy_ceiling = spectral_energy_ceiling
        self._decimal_precision = max(decimal_precision, 28)

    def audit(
        self,
        *,
        predictions: Sequence[float],
        targets: Sequence[float],
        primary_score: float,
    ) -> AuditResult:
        if len(predictions) != len(targets):
            raise ValueError("predictions and targets must be aligned")
        decimal_score = self._decimal_score(predictions, targets)
        variance_ratio = self._variance_ratio(predictions, targets)
        spectral_ratio = self._spectral_ratio(
            residuals=(target - prediction for prediction, target in zip(predictions, targets))
        )
        return AuditResult(
            precision_score=decimal_score,
            variance_ratio=variance_ratio,
            spectral_ratio=spectral_ratio,
            pass_precision=abs(decimal_score - primary_score) <= self._precision_tolerance,
            pass_variance=variance_ratio <= self._variance_ratio_ceiling,
            pass_spectral=spectral_ratio <= self._spectral_energy_ceiling,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    def _decimal_score(self, predictions: Sequence[float], targets: Sequence[float]) -> float:
        getcontext().prec = self._decimal_precision
        baseline_error = Decimal(str(self._baseline_error))
        total = Decimal("0")
        count = Decimal("0")
        for prediction, target in zip(predictions, targets):
            diff = Decimal(str(prediction)) - Decimal(str(target))
            total += diff * diff
            count += Decimal(1)
        if count == 0:
            return 0.0
        mse = total / count
        normalised = Decimal("1") - min(mse / baseline_error, Decimal("1"))
        score = max(normalised, Decimal("0")) ** Decimal("0.5")
        return float(score)

    def _variance_ratio(self, predictions: Sequence[float], targets: Sequence[float]) -> float:
        if not predictions:
            return 0.0
        residuals = [target - prediction for prediction, target in zip(predictions, targets)]
        if len(residuals) < 2:
            return 0.0
        signal_spread = pstdev(targets) or 1e-12
        residual_spread = pstdev(residuals)
        return float(max(residual_spread, 0.0) / signal_spread)

    def _spectral_ratio(self, *, residuals: Iterable[float]) -> float:
        values = list(residuals)
        if not values:
            return 0.0
        total_energy = sum(value * value for value in values)
        if total_energy <= 0:
            return 0.0
        n = len(values)
        max_component = 0.0
        for harmonic in range(1, min(6, n)):
            cos_sum = 0.0
            sin_sum = 0.0
            for index, value in enumerate(values):
                angle = 2 * math.pi * harmonic * index / n
                cos_sum += value * math.cos(angle)
                sin_sum += value * math.sin(angle)
            component_energy = (cos_sum**2 + sin_sum**2) / n
            max_component = max(max_component, component_energy)
        if max_component <= 0:
            return 0.0
        return min(max_component / total_energy, 1.0)
