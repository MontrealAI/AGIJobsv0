"""Demo-wide interpreter customisation for reliable local test runs.

Running ``pytest`` from ``demo/`` previously failed before collection because
globally installed plugins were auto-loaded and the demo packages were not on
``sys.path``.  This hook executes as soon as Python starts (because the demo
root is on ``sys.path`` when invoked from here), letting us harden the
environment before Pytest initialises.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Iterable


def _ensure_path(paths: Iterable[Path]) -> None:
    for path in paths:
        resolved = str(path.resolve())
        if resolved and resolved not in sys.path:
            sys.path.insert(0, resolved)


# Prevent third-party pytest entrypoint discovery before our configuration is
# loaded. Without this, globally installed plugins (for example,
# ``web3.tools.pytest_ethereum``) can crash collection in sandboxes that do not
# ship every optional dependency.
os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

DEMO_ROOT = Path(__file__).resolve().parent

# Expose the demo root itself plus any immediate children that look like Python
# demos (contain tests or Python sources). This keeps import resolution
# predictable without needing per-demo PYTHONPATH tweaks.
_ensure_path([DEMO_ROOT])

candidate_paths: list[Path] = []
for child in DEMO_ROOT.iterdir():
    if not child.is_dir():
        continue

    has_tests = (child / "tests").is_dir()
    has_python = any(child.glob("*.py"))
    has_package = any(
        pkg.is_dir() and (pkg / "__init__.py").is_file()
        for pkg in [
            child / child.name,
            child / "src",
            child / "python",
            child,
        ]
    )

    if has_tests or has_python or has_package:
        candidate_paths.append(child)

_ensure_path(candidate_paths)
