"""Forward execution to the canonical demo package."""

from importlib import import_module

_main_module = import_module(
    "demo.Kardashev-II Omega-Grade-α-AGI Business-3.kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega.__main__"
)
main = _main_module.main

if __name__ == "__main__":  # pragma: no cover - script execution entry
    main()
