"""Namespace package that re-exports the Omega-grade demo."""

from importlib import import_module

_pkg = import_module(
    "demo.Kardashev-II-Omega-Grade-Alpha-AGI-Business-3.kardashev_ii_omega_grade_alpha_agi_business_3",
    package=__name__,
)

globals().update({k: getattr(_pkg, k) for k in getattr(_pkg, "__all__", [])})
__all__ = getattr(_pkg, "__all__", [])
