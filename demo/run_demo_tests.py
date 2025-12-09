"""Execute every demo test suite in isolated subprocesses.

Running ``pytest demo`` directly previously led to import collisions across
independent demos. This runner scans each demo's test directory, builds a
per-suite ``PYTHONPATH`` that includes that demo's packages (``src``/``python``
folders, ``grand_demo`` stubs, etc.), and executes pytest in a fresh
interpreter. The isolation keeps overlapping module names from interfering
with one another while still allowing a single command to validate the
entire demo gallery.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable


def _candidate_paths(demo_root: Path) -> Iterable[Path]:
    for relative in (
        "grand_demo/alpha_node",
        "grand_demo",
        "src",
        "python",
        ".",
        "grandiose_alpha_demo/src",
    ):
        candidate = demo_root / relative
        if candidate.is_dir():
            yield candidate


def _build_pythonpath(demo_root: Path) -> str:
    entries = [str(path) for path in _candidate_paths(demo_root)]
    existing = os.environ.get("PYTHONPATH", "")
    if existing:
        entries.append(existing)
    return os.pathsep.join(dict.fromkeys(entries))


def _run_suite(demo_root: Path, tests_dir: Path) -> int:
    env = os.environ.copy()
    env["PYTHONPATH"] = _build_pythonpath(demo_root)
    cmd = [sys.executable, "-m", "pytest", str(tests_dir), "--import-mode=importlib"]
    print(f"\n→ Running {tests_dir} with PYTHONPATH={env['PYTHONPATH']}")
    result = subprocess.run(cmd, env=env, check=False)
    return 0 if result.returncode == 5 else result.returncode


def _discover_tests(demo_root: Path) -> Iterable[tuple[Path, Path]]:
    for demo_dir in sorted(p for p in demo_root.iterdir() if p.is_dir()):
        for tests_dir in demo_dir.rglob("tests"):
            if not tests_dir.is_dir() or "node_modules" in tests_dir.parts:
                continue
            yield demo_dir, tests_dir


def main() -> int:
    demo_root = Path(__file__).resolve().parent
    failures = 0
    for demo_dir, tests_dir in _discover_tests(demo_root):
        failures += _run_suite(demo_dir, tests_dir)
    if failures:
        print(f"\n⚠️  Demo test runs completed with {failures} failures.")
        return 1
    print("\n✅ All demo test suites passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
