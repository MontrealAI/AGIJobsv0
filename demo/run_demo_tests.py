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

import argparse
import contextlib
import os
import shutil
import subprocess
import sys
import tempfile
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
    entries: list[str] = []
    seen: set[str] = set()

    def _remember(path: Path) -> None:
        resolved = str(path.resolve())
        if resolved and resolved not in seen:
            seen.add(resolved)
            entries.append(resolved)

    for path in _candidate_paths(demo_root):
        _remember(path)

    existing = os.environ.get("PYTHONPATH")
    if existing:
        for segment in existing.split(os.pathsep):
            if segment:
                _remember(Path(segment))

    return os.pathsep.join(entries)


def _configure_runtime_env(runtime_root: Path) -> dict[str, str]:
    """Route orchestrator state into a temporary sandbox."""

    storage_root = runtime_root / "orchestrator"
    overrides = {
        "ORCHESTRATOR_SCOREBOARD_PATH": storage_root / "scoreboard.json",
        "ORCHESTRATOR_CHECKPOINT_PATH": storage_root / "checkpoint.json",
        "ORCHESTRATOR_CHECKPOINT_LEVELDB": storage_root / "checkpoint.db",
        "ORCHESTRATOR_GOVERNANCE_PATH": storage_root / "governance.json",
        "ORCHESTRATOR_STATE_DIR": storage_root / "runs",
        "AGENT_REGISTRY_PATH": storage_root / "agents" / "registry.json",
    }

    for path in overrides.values():
        target = Path(path)
        if target.suffix:
            target.parent.mkdir(parents=True, exist_ok=True)
        else:
            target.mkdir(parents=True, exist_ok=True)

    return {key: str(value) for key, value in overrides.items()}


def _suite_runtime_root(base_runtime: Path, demo_dir: Path, tests_dir: Path) -> Path:
    """Derive a unique sandbox path for a demo test suite.

    Multiple demos share common directory names such as ``grand_demo/tests``.
    Using only the immediate parent directory for isolation can therefore
    collapse distinct suites into the same runtime sandbox, allowing state to
    bleed across runs. Anchoring the sandbox by demo name and the tests
    directory's relative location keeps each suite hermetic.
    """

    relative_tests_path = tests_dir.relative_to(demo_dir)
    return base_runtime / demo_dir.name / relative_tests_path


def _run_suite(
    demo_root: Path,
    tests_dir: Path,
    env_overrides: dict[str, str],
    *,
    timeout: float | None = None,
) -> int:
    env = os.environ.copy()
    env.update(env_overrides)
    env.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")
    env["PYTHONPATH"] = _build_pythonpath(demo_root)
    cmd = [sys.executable, "-m", "pytest", str(tests_dir), "--import-mode=importlib"]
    print(f"\n→ Running {tests_dir} with PYTHONPATH={env['PYTHONPATH']}")
    # Execute from the suite's directory so sys.path[0] points at the demo under
    # test, preventing sibling packages with the same name from taking
    # precedence.
    run_kwargs = {"env": env, "check": False, "cwd": tests_dir.parent}
    if timeout is not None:
        run_kwargs["timeout"] = timeout

    try:
        result = subprocess.run(cmd, **run_kwargs)
    except subprocess.TimeoutExpired:
        print(
            f"⏰  Timed out running {tests_dir} after {timeout}s; "
            "investigate slow or hanging demos."
        )
        return 1
    # ``pytest`` returns ``5`` when no tests are collected; treat that as a
    # successful (albeit empty) suite so the aggregated status is accurate.
    return 0 if result.returncode == 5 else result.returncode


def _has_python_tests(tests_dir: Path) -> bool:
    """Return True when a tests directory contains at least one Python test file.

    Some demos include JavaScript/TypeScript test harnesses that are intentionally
    outside our Python test runner's scope. Skipping those directories keeps the
    run focused on actionable suites and avoids noisy "collected 0 items"
    reports that make it harder to spot real failures.
    """

    for file in tests_dir.rglob("*.py"):
        name = file.name
        if name.startswith("test") or name.endswith("_test.py"):
            return True
    return False


_SKIP_TEST_PARTS = {"node_modules", ".venv", "venv", ".tox", ".git"}


def _discover_tests(
    demo_root: Path, *, include: set[str] | None = None
) -> Iterable[tuple[Path, Path]]:
    def _matches_filter(path: Path) -> bool:
        if include is None:
            return True
        name = path.name.lower()
        return any(token in name for token in include)

    # Iterate in a deterministic order so CI logs remain stable across runs.
    for demo_dir in sorted((p for p in demo_root.iterdir() if p.is_dir())):
        if not _matches_filter(demo_dir):
            continue
        for tests_dir in sorted(demo_dir.rglob("tests")):
            if not tests_dir.is_dir():
                continue
            if any(part in _SKIP_TEST_PARTS for part in tests_dir.parts):
                continue
            if not _has_python_tests(tests_dir):
                print(f"→ Skipping {tests_dir} (no Python test files found)")
                continue
            yield demo_dir, tests_dir


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--demo",
        "--include",
        dest="demo",
        action="append",
        default=[],
        help=(
            "Only run demos whose directory names contain the provided substring. "
            "Can be supplied multiple times."
        ),
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List discovered suites (after filtering) without running them.",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help=(
            "Stop after the first failing suite instead of executing every demo. "
            "Use this in local runs to get the fastest feedback loop."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=None,
        help=(
            "Fail a suite if it exceeds the given runtime in seconds. "
            "Use this to detect hanging demo tests early."
        ),
    )
    parser.add_argument(
        "--runtime-dir",
        type=Path,
        default=None,
        help=(
            "Optional directory to store orchestrator runtime artifacts. "
            "When provided, sandboxes are kept after the run to aid debugging; "
            "otherwise a temporary directory is used and cleaned up automatically."
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None, demo_root: Path | None = None) -> int:
    args = _parse_args(argv)
    include = {token.lower() for token in args.demo} or None
    demo_root = demo_root or Path(__file__).resolve().parent
    suites = list(_discover_tests(demo_root, include=include))

    runtime_context: contextlib.AbstractContextManager[str]
    if args.runtime_dir:
        runtime_dir = args.runtime_dir.expanduser().resolve()
        runtime_dir.mkdir(parents=True, exist_ok=True)
        runtime_context = contextlib.nullcontext(str(runtime_dir))
    else:
        runtime_context = tempfile.TemporaryDirectory(prefix="demo-orchestrator-")

    with runtime_context as runtime_dir:
        runtime_root = Path(runtime_dir)

        if args.list:
            if not suites:
                print("No demo test suites found for the provided filters.")
                return 1
            print("Discovered demo test suites:")
            for _, tests_dir in suites:
                print(f" - {tests_dir}")
            return 0

        if not suites:
            print("No demo test suites found for the provided filters.")
            return 1

        results: list[tuple[Path, int]] = []
        try:
            for demo_dir, tests_dir in suites:
                # Allocate an isolated runtime sandbox per suite to eliminate
                # cross-contamination between demos that rely on orchestrator state.
                suite_runtime = _suite_runtime_root(runtime_root, demo_dir, tests_dir)
                if suite_runtime.exists():
                    shutil.rmtree(suite_runtime)
                env_overrides = _configure_runtime_env(suite_runtime)
                code = _run_suite(
                    demo_dir, tests_dir, env_overrides, timeout=args.timeout
                )
                results.append((tests_dir, code))

                if args.fail_fast and code:
                    print(
                        "\n⛔️  Halting remaining demo suites because --fail-fast is enabled."
                    )
                    break
        except KeyboardInterrupt:
            completed = len(results)
            remaining = len(suites) - completed
            print(
                f"\n⚠️  Interrupted after {completed} of {len(suites)} suites; "
                f"{remaining} remaining."
            )
            return 130

        failed = [(path, code) for path, code in results if code]
        if failed:
            print("\n⚠️  Demo test runs completed with failures:")
            for tests_dir, code in failed:
                print(f"   • {tests_dir} (exit code {code})")
            return 1

        print(f"\n✅ All demo test suites passed ({len(results)} suites).")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
