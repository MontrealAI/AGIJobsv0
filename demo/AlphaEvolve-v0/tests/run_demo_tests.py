#!/usr/bin/env python3
"""Dedicated entry point that runs the AlphaEvolve demo tests hermetically."""

from __future__ import annotations

import os
import pathlib
import sys


def main(argv: list[str] | None = None) -> int:
    """Execute pytest with plugin auto-discovery disabled.

    The AlphaEvolve demo depends solely on the repository's pinned Python
    requirements. Some globally installed pytest plugins attempt to import
    optional third-party stacks (for example, Ethereum toolchains) that are
    outside the demo's scope. To provide a turnkey experience for operators,
    we disable pytest's entry-point auto discovery here *before* importing the
    pytest package. This mirrors the manual command
    ``PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest demo/AlphaEvolve-v0/tests``
    while sparing operators from environment fiddling.
    """

    os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

    try:
        import pytest
    except ModuleNotFoundError as exc:  # pragma: no cover - surfaced to operators
        raise SystemExit(
            "pytest is required to run the AlphaEvolve demo test suite. "
            "Install development dependencies via `pip install -r requirements-python.txt`."
        ) from exc

    tests_dir = pathlib.Path(__file__).resolve().parent
    args = argv if argv is not None else sys.argv[1:]
    return pytest.main([str(tests_dir), *args])


if __name__ == "__main__":
    raise SystemExit(main())
