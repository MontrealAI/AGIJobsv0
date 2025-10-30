"""Pytest configuration for the Huxley–Gödel Machine demo tests."""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the repository root is importable so ``import demo`` resolves even when
# pytest changes the working directory to this tests folder. This mirrors the
# behaviour provided by the project-level ``sitecustomize`` module.
ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Importing ``sitecustomize`` applies any global interpreter tweaks (such as
# disabling third-party pytest plugin auto-discovery) that developers expect
# when running tests from the repository root.
try:
    import sitecustomize  # noqa: F401  # pylint: disable=unused-import
except ImportError:
    # Fallback gracefully if the module is unavailable for some reason. The
    # critical behaviour is ensuring the repository root is on ``sys.path``.
    pass
