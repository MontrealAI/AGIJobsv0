"""Regression tests for the Supreme Omega-grade demo wrapper.

The compatibility package under ``demo/kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme``
must expose an ASCII-safe ``main`` callable so that ``run_demo.py`` and other
automation entrypoints can launch the canonical demo without needing the
Unicode-heavy directory name in ``sys.path``. These tests guard against
regressions where ``main`` silently disappears.
"""

from __future__ import annotations

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme import (
    main,
    run_from_cli,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme import (
    run_demo as demo_runner,
)


def test_wrapper_exposes_main_alias():
    """Ensure the compatibility module wires ``main`` to the canonical CLI."""

    assert main is not None
    assert main is run_from_cli


def test_run_demo_accepts_injected_main_fn():
    """Validate the ASCII-safe run helper can execute an injected launcher."""

    captured_args: list[list[str]] = []

    def fake_main(argv):
        captured_args.append(list(argv))

    demo_runner.run(["--alpha", "--beta"], main_fn=fake_main)

    assert captured_args == [["--alpha", "--beta"]]
