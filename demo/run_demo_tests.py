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
from dataclasses import dataclass
from typing import Iterable, Literal


@dataclass(frozen=True)
class Suite:
    demo_root: Path
    tests_dir: Path
    runner: Literal["python", "node"]


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

    # Meta-suites live directly under ``demo/tests`` and need the demo root on
    # ``sys.path`` to import the runner itself (``demo.run_demo_tests``).
    if demo_root.name == "tests" and demo_root.parent.is_dir():
        yield demo_root.parent


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


def _normalize_include_filters(raw: Iterable[str]) -> set[str] | None:
    """Expand ``--demo`` filters, supporting comma-separated tokens.

    Users sometimes pass multiple filter values in a single argument
    (for example, ``--demo alpha,beta``). Normalizing here lets the
    discovery layer remain simple while still honoring flexible CLI
    input patterns.
    """

    tokens: set[str] = set()

    for value in raw:
        for part in value.split(","):
            cleaned = part.strip()
            if cleaned:
                tokens.add(cleaned.lower())

    return tokens or None


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
    suite: Suite,
    env_overrides: dict[str, str],
    *,
    allow_empty: bool = False,
    timeout: float | None = None,
) -> int:
    env = os.environ.copy()
    env.update(env_overrides)

    if suite.runner == "node":
        # Force non-interactive, reproducible npm runs. CI ensures tools like
        # Vitest or Jest avoid watch mode and exit after executing the suite,
        # while disabling progress and fund prompts removes noisy network
        # calls that can otherwise hang or slow demos in sandboxed
        # environments.
        env.setdefault("CI", "1")
        env.setdefault("npm_config_progress", "false")
        env.setdefault("npm_config_fund", "false")
        cmd = ["npm", "test", "--", "--runInBand"]
        description = f"{suite.tests_dir} via npm test"
        cwd = suite.demo_root
    else:
        env.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")
        env["PYTHONPATH"] = _build_pythonpath(suite.demo_root)
        cmd = [
            sys.executable,
            "-m",
            "pytest",
            str(suite.tests_dir),
            "--import-mode=importlib",
        ]
        description = f"{suite.tests_dir} with PYTHONPATH={env['PYTHONPATH']}"
        cwd = suite.tests_dir.parent

    print(f"\n→ Running {description}")
    run_kwargs = {"env": env, "check": False, "cwd": cwd}
    if timeout is not None:
        run_kwargs["timeout"] = timeout

    try:
        result = subprocess.run(cmd, **run_kwargs)
    except FileNotFoundError:
        missing_binary = cmd[0]
        print(
            f"⛔️  Required executable '{missing_binary}' is not available on PATH "
            f"while running {suite.tests_dir}. Install it or adjust PATH to "
            "continue."
        )
        return 1
    except subprocess.TimeoutExpired:
        print(
            f"⏰  Timed out running {suite.tests_dir} after {timeout}s; "
            "investigate slow or hanging demos."
        )
        return 1

    if suite.runner == "python" and result.returncode == 5:
        message = (
            "⚠️  No tests were collected for this suite. "
            "Confirm the tests directory contains runnable files."
        )
        if allow_empty:
            print(message)
            return 0

        print(f"⛔️  {message}")
        return result.returncode

    return result.returncode


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


def _has_node_tests(tests_dir: Path) -> bool:
    has_package = (tests_dir.parent / "package.json").is_file()
    if not has_package:
        return False

    for file in tests_dir.rglob("*.test.*"):
        if file.suffix in {".js", ".ts", ".jsx", ".tsx"}:
            return True
    for file in tests_dir.rglob("*.spec.*"):
        if file.suffix in {".js", ".ts", ".jsx", ".tsx"}:
            return True
    return False


def _node_package_root(tests_dir: Path, demo_dir: Path) -> Path:
    """Return the nearest ancestor with a package.json, stopping at ``demo_dir``.

    Some demos embed multiple Node projects (for example, ``v2`` rewrites). When
    invoked from the top-level demo directory, ``npm`` will walk upward until it
    finds a ``package.json``—often the repository root—which launches the wrong
    test suite. Anchoring execution to the closest package root within the demo
    keeps demo-specific tests isolated and avoids accidentally running the
    monorepo's full Hardhat and web stacks.
    """

    for ancestor in [tests_dir, *tests_dir.parents]:
        if ancestor == demo_dir.parent:
            break
        if (ancestor / "package.json").is_file():
            return ancestor
        if ancestor == demo_dir:
            break

    return demo_dir


_SKIP_TEST_PARTS = {"node_modules", ".venv", "venv", ".tox", ".git"}


def _discover_tests(
    demo_root: Path, *, include: set[str] | None = None
) -> Iterable[Suite]:
    def _iter_tests_dirs(root: Path) -> Iterable[Path]:
        # Some suites (e.g., the runner's own tests) live directly under a
        # ``tests`` directory instead of nested beneath a demo package. rglob
        # does not yield the starting directory when it already matches the
        # pattern, so we surface it explicitly.
        if root.name == "tests":
            yield root
        yield from root.rglob("tests")

    def _matches_filter(path: Path) -> bool:
        if include is None:
            return True

        name = path.name.lower()
        relative = str(path.relative_to(demo_root)).lower()

        return any(
            token in name or token in relative or relative in token
            for token in include
        )

    # Iterate in a deterministic order so CI logs remain stable across runs.
    for demo_dir in sorted((p for p in demo_root.iterdir() if p.is_dir())):
        if not _matches_filter(demo_dir):
            continue
        for tests_dir in sorted(_iter_tests_dirs(demo_dir)):
            if not tests_dir.is_dir():
                continue
            if any(part in _SKIP_TEST_PARTS for part in tests_dir.parts):
                continue
            if _has_python_tests(tests_dir):
                yield Suite(demo_root=demo_dir, tests_dir=tests_dir, runner="python")
                continue
            if _has_node_tests(tests_dir):
                package_root = _node_package_root(tests_dir, demo_dir)
                yield Suite(demo_root=package_root, tests_dir=tests_dir, runner="node")
                continue
            print(f"→ Skipping {tests_dir} (no recognized test files found)")


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
        "--allow-empty",
        action="store_true",
        help=(
            "Treat suites with zero collected tests as a warning instead of an error. "
            "Use this for in-progress demos that intentionally ship without tests."
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
    include = _normalize_include_filters(args.demo)
    demo_root = demo_root or Path(__file__).resolve().parent
    suites = list(_discover_tests(demo_root, include=include))

    if args.list:
        if not suites:
            print("No demo test suites found for the provided filters.")
            return 1
        print("Discovered demo test suites:")
        for suite in suites:
            print(f" - {suite.tests_dir} [{suite.runner}]")
        return 0

    runtime_context: contextlib.AbstractContextManager[str]
    if args.runtime_dir:
        runtime_dir = args.runtime_dir.expanduser().resolve()
        runtime_dir.mkdir(parents=True, exist_ok=True)
        runtime_context = contextlib.nullcontext(str(runtime_dir))
    else:
        runtime_context = tempfile.TemporaryDirectory(prefix="demo-orchestrator-")

    with runtime_context as runtime_dir:
        runtime_root = Path(runtime_dir)

        if not suites:
            print("No demo test suites found for the provided filters.")
            return 1

        results: list[tuple[Suite, int]] = []
        try:
            for suite in suites:
                # Allocate an isolated runtime sandbox per suite to eliminate
                # cross-contamination between demos that rely on orchestrator state.
                suite_runtime = _suite_runtime_root(
                    runtime_root, suite.demo_root, suite.tests_dir
                )
                if suite_runtime.exists():
                    shutil.rmtree(suite_runtime)
                env_overrides = _configure_runtime_env(suite_runtime)
                code = _run_suite(
                    suite,
                    env_overrides,
                    allow_empty=args.allow_empty,
                    timeout=args.timeout,
                )
                results.append((suite, code))

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

        failed = [(suite, code) for suite, code in results if code]
        if failed:
            print("\n⚠️  Demo test runs completed with failures:")
            for suite, code in failed:
                print(f"   • {suite.tests_dir} (exit code {code})")
            return 1

        print(f"\n✅ All demo test suites passed ({len(results)} suites).")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
