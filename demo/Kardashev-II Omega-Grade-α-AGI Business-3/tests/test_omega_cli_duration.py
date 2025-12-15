"""Runtime guardrails for the Omega demo CLI."""

from kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega.cli import (
    _resolve_duration,
)


def test_default_duration_is_finite():
    """Default runs should finish on their own to avoid hanging demo sessions."""

    assert _resolve_duration(None) == 10.0


def test_zero_duration_runs_indefinitely():
    """Operators can still opt into an open-ended run by passing zero."""

    assert _resolve_duration(0) is None


def test_positive_duration_passthrough():
    """Explicit durations are preserved for deterministic scheduling."""

    assert _resolve_duration(42) == 42.0
