"""Forward import to the omega upgrade CLI."""

from importlib import import_module

_main_module = import_module(
    "demo.Kardashev-II-Omega-Grade-Alpha-AGI-Business-3-Omega-Upgrade.kardashev_ii_omega_grade_alpha_agi_business_3_omega_upgrade.__main__"
)
main = _main_module.main

if __name__ == "__main__":
    main()
