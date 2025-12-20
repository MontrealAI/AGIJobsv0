"""Shared Pytest hooks for the demo gallery."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Iterable


def _prepend_paths(paths: Iterable[Path]) -> None:
    for path in paths:
        resolved = str(path.resolve())
        if resolved and resolved not in sys.path:
            sys.path.insert(0, resolved)


def pytest_configure() -> None:
    """Normalise environment and import paths for demo suites."""

    # Harden the environment before any suite-specific hooks run.
    os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")


# Apply the path adjustments at import time so test modules can import their
# corresponding demo packages during collection.
_DEMO_ROOT = Path(__file__).resolve().parent
_REPO_ROOT = _DEMO_ROOT.parent
_CANDIDATE_PATHS: list[Path] = [_REPO_ROOT, _DEMO_ROOT]

for _child in _DEMO_ROOT.iterdir():
    if not _child.is_dir():
        continue

    _has_tests = (_child / "tests").is_dir()
    _has_python_files = any(_child.glob("*.py"))
    _has_package_dirs = any(
        _pkg.is_dir() and (_pkg / "__init__.py").is_file()
        for _pkg in [_child, _child / _child.name]
    )

    if _has_tests or _has_python_files or _has_package_dirs:
        _CANDIDATE_PATHS.append(_child)

    for _subdir in ("src", "python"):
        _subpath = _child / _subdir
        if _subpath.is_dir():
            _CANDIDATE_PATHS.append(_subpath)

_prepend_paths(_CANDIDATE_PATHS)

if os.environ.get("DEMO_SYS_PATH_DEBUG"):
    print("demo sys.path (head)", sys.path[:20])
