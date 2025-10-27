"""Bridge for the K2 Omega-grade α-AGI Business 3 demo package."""

from __future__ import annotations

from importlib import import_module
from pathlib import Path

_pkg_dir = Path(__file__).resolve().parent
_nested = (
    _pkg_dir.parent
    / "demo"
    / "Kardashev-II Omega-Grade-α-AGI Business-3"
    / "kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2"
)
__path__ = [str(_nested)]

MissionPlan = import_module(".config", __name__).MissionPlan
OperatorControlPanel = import_module(".control_panel", __name__).OperatorControlPanel
main = import_module(".cli", __name__).main

__all__ = ["MissionPlan", "OperatorControlPanel", "main"]
