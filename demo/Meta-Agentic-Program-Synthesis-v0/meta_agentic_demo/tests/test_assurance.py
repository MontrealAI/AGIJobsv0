from __future__ import annotations

import math

import pytest

from meta_agentic_demo.assurance import IndependentAuditor


def compute_primary_score(predictions: list[float], targets: list[float], baseline_error: float) -> float:
    mse = sum((p - t) ** 2 for p, t in zip(predictions, targets)) / max(len(predictions), 1)
    normalised = 1.0 - min(mse / max(baseline_error, 1e-9), 1.0)
    return max(normalised, 0.0) ** 0.5


def test_independent_auditor_validates_consistency() -> None:
    targets = [1.0, 1.5, 2.0, 2.5, 3.0]
    zero_predictions = [0.0] * len(targets)
    baseline_error = sum((t - z) ** 2 for t, z in zip(targets, zero_predictions)) / len(targets)
    predictions = [0.95, 1.55, 1.98, 2.48, 3.05]
    primary_score = compute_primary_score(predictions, targets, baseline_error)
    auditor = IndependentAuditor(
        baseline_error=baseline_error,
        precision_tolerance=0.02,
        variance_ratio_ceiling=1.5,
        spectral_energy_ceiling=0.8,
    )
    result = auditor.audit(predictions=predictions, targets=targets, primary_score=primary_score)
    assert pytest.approx(result.precision_score, rel=1e-6) == primary_score
    assert result.pass_precision
    assert result.pass_variance
    assert result.pass_spectral
    assert 0 <= result.spectral_ratio <= 1


def test_independent_auditor_flags_anomalies() -> None:
    targets = [math.sin(i / 3.0) for i in range(24)]
    zero_predictions = [0.0] * len(targets)
    baseline_error = sum((t - z) ** 2 for t, z in zip(targets, zero_predictions)) / len(targets)
    predictions = [0.0 for _ in targets]
    primary_score = compute_primary_score(predictions, targets, baseline_error)
    auditor = IndependentAuditor(
        baseline_error=baseline_error,
        precision_tolerance=0.001,
        variance_ratio_ceiling=0.5,
        spectral_energy_ceiling=0.2,
    )
    tampered_primary = primary_score + 0.05
    result = auditor.audit(predictions=predictions, targets=targets, primary_score=tampered_primary)
    assert not result.pass_precision
    assert not result.pass_variance
    assert not result.pass_spectral
    assert result.variance_ratio >= 0.5
    assert result.spectral_ratio >= 0.2
