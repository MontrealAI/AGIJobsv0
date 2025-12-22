"""Module entrypoint for the Omega-grade wrapper package.

Keeping ``python -m demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega``
aligned with the ASCII-safe ``run_demo`` helper prevents import errors caused by
the Unicode-heavy canonical package path. Delegating to the shared launcher
keeps the invocation consistent with the primary demo wrapper.
"""

from __future__ import annotations

from .run_demo import run


def main() -> None:
    """Invoke the demo CLI via the wrapper launcher."""

    run()


if __name__ == "__main__":  # pragma: no cover - exercised via subprocess
    main()
