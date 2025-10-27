"""Bridge package exposing the Omega-Grade Upgrade v4 demo at top level."""

from __future__ import annotations

from pathlib import Path

_pkg_dir = Path(__file__).resolve().parent
_nested = (
    _pkg_dir.parent
    / "demo"
    / "Kardashev-II Omega-Grade-α-AGI Business-3"
    / "kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v4"
)
__path__ = [str(_nested)]
__all__: list[str] = []
