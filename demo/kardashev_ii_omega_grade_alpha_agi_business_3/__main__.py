"""Forwarder to the Omega-grade demo CLI."""

from importlib import import_module

_main_module = import_module(
    "demo.Kardashev-II-Omega-Grade-Alpha-AGI-Business-3.kardashev_ii_omega_grade_alpha_agi_business_3.__main__"
)
main = _main_module.main

if __name__ == "__main__":
    main()
