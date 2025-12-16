"""Module entrypoint for the Kardashev-II Omega-Grade α-AGI Business 3 demo.

This keeps ``python -m demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo``
compatible with the ASCII-safe wrapper by delegating to the same CLI launcher
used by ``run_demo.py``. Keeping the invocation path uniform avoids surprises
for operators who expect the ``-m`` idiom to work across demos.
"""
from __future__ import annotations

from .run_demo import run


def main() -> None:
    """Invoke the demo's CLI and exit with an appropriate status code."""

    run()


if __name__ == "__main__":  # pragma: no cover - exercised via subprocess
    main()
