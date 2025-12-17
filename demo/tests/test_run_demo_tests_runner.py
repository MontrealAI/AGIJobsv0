from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Iterable

import pytest

from demo import run_demo_tests


def test_suite_runtime_root_uses_demo_and_relative_path(tmp_path: Path) -> None:
    demo_a = tmp_path / "demo-a"
    demo_b = tmp_path / "demo-b"
    for demo in (demo_a, demo_b):
        tests_dir = demo / "nested" / "tests"
        tests_dir.mkdir(parents=True)

    suite_a = run_demo_tests._suite_runtime_root(
        tmp_path, demo_a, demo_a / "nested" / "tests", runner="python"
    )
    suite_b = run_demo_tests._suite_runtime_root(
        tmp_path, demo_b, demo_b / "nested" / "tests", runner="node"
    )

    assert suite_a != suite_b
    assert suite_a.relative_to(tmp_path) == Path("demo-a/nested/tests/python")
    assert suite_b.relative_to(tmp_path) == Path("demo-b/nested/tests/node")


def test_main_respects_runtime_dir_option(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    test_file = tests_dir / "test_ok.py"
    test_file.write_text("def test_ok():\n    assert True\n")

    runtime_dir = tmp_path / "runtime"

    exit_code = run_demo_tests.main(["--runtime-dir", str(runtime_dir)], demo_root=demo_root)

    assert exit_code == 0
    sandbox = runtime_dir / "example" / "tests" / "python" / "orchestrator"
    assert sandbox.exists()
    assert (sandbox / "agents").exists()


def test_main_clears_existing_runtime_dir(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_ok.py").write_text("def test_ok():\n    assert True\n")

    runtime_dir = tmp_path / "runtime"
    stale_artifact = (
        runtime_dir / "example" / "tests" / "python" / "orchestrator" / "checkpoint.json"
    )
    stale_artifact.parent.mkdir(parents=True)
    stale_artifact.write_text("stale checkpoint")

    exit_code = run_demo_tests.main(["--runtime-dir", str(runtime_dir)], demo_root=demo_root)

    assert exit_code == 0
    assert not stale_artifact.exists()


def test_list_mode_does_not_create_runtime_artifacts(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_ok.py").write_text("def test_ok():\n    assert True\n")

    runtime_dir = tmp_path / "runtime"

    exit_code = run_demo_tests.main(
        ["--list", "--runtime-dir", str(runtime_dir)], demo_root=demo_root
    )

    assert exit_code == 0
    assert not runtime_dir.exists()


def test_top_level_tests_directory_is_discovered(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_ok.py").write_text("def test_ok():\n    assert True\n")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=tests_dir,
            tests_dir=tests_dir,
            runner="python",
        )
    ]


def test_include_filter_matches_relative_paths(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    alpha_tests = demo_root / "alpha" / "tests"
    beta_tests = demo_root / "beta" / "nested" / "tests"
    alpha_tests.mkdir(parents=True)
    beta_tests.mkdir(parents=True)
    (alpha_tests / "test_alpha.py").write_text("def test_alpha():\n    assert True\n")
    (beta_tests / "test_beta.py").write_text("def test_beta():\n    assert True\n")

    suites = list(
        run_demo_tests._discover_tests(
            demo_root, include={"beta/nested", "does-not-match"}
        )
    )

    assert suites == [
        run_demo_tests.Suite(
            demo_root=demo_root / "beta",
            tests_dir=beta_tests,
            runner="python",
        )
    ]


def test_demo_filter_normalizes_comma_separated_tokens() -> None:
    include = run_demo_tests._normalize_include_filters([
        " Alpha ,beta/nested ",
        " ,gamma",
    ])

    assert include == {"alpha", "beta/nested", "gamma"}


def test_demo_filter_returns_none_when_empty() -> None:
    assert run_demo_tests._normalize_include_filters([]) is None
    assert run_demo_tests._normalize_include_filters([" , "]) is None


def test_top_level_tests_pythonpath_includes_demo_root(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "tests"
    tests_dir.mkdir(parents=True)

    pythonpath = run_demo_tests._build_pythonpath(tests_dir)

    # Ensure the parent ``demo`` directory is present so imports like ``demo``
    # or ``demo.run_demo_tests`` succeed when running the meta-suite in
    # isolation.
    assert str(demo_root.resolve()) in pythonpath.split(os.pathsep)


def test_discovers_node_suite_when_python_tests_absent(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "node-demo"
    tests_dir = project_dir / "tests"
    tests_dir.mkdir(parents=True)
    (project_dir / "package.json").write_text("{}\n")
    (project_dir / "package-lock.json").write_text("{}\n")
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=project_dir, tests_dir=tests_dir, runner="node"
        )
    ]


def test_node_suite_anchors_to_nearest_package(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "node-demo"
    nested_project = project_dir / "v2"
    tests_dir = nested_project / "tests"
    tests_dir.mkdir(parents=True)

    (nested_project / "package.json").write_text("{}\n")
    (nested_project / "package-lock.json").write_text("{}\n")
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=nested_project, tests_dir=tests_dir, runner="node"
        )
    ]


def test_python_and_node_suites_can_share_tests_dir(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "shared" / "tests"
    tests_dir.mkdir(parents=True)

    (demo_root / "package.json").write_text("{}\n")
    (demo_root / "package-lock.json").write_text("{}\n")
    (tests_dir / "test_alpha.py").write_text("def test_alpha():\n    assert True\n")
    (tests_dir / "alpha.test.ts").write_text("describe('ok', () => {});\n")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=demo_root / "shared",
            tests_dir=tests_dir,
            runner="python",
        ),
        run_demo_tests.Suite(
            demo_root=demo_root,
            tests_dir=tests_dir,
            runner="node",
        ),
    ]


def test_discovers_package_above_nested_tests_dir(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "node-demo"
    nested_tests = project_dir / "subsystem" / "__tests__"
    nested_tests.mkdir(parents=True)

    (project_dir / "package.json").write_text("{}\n")
    (project_dir / "package-lock.json").write_text("{}\n")
    (nested_tests / "ledger.test.ts").write_text("describe('ok', () => {});")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=project_dir,
            tests_dir=nested_tests,
            runner="node",
        )
    ]


def test_empty_suite_fails_without_allow_empty(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    # Present a test file that collects nothing so pytest exits with code 5.
    (tests_dir / "test_empty.py").write_text("# no tests yet\n")

    exit_code = run_demo_tests.main(["--runtime-dir", str(tmp_path / "runtime")], demo_root=demo_root)

    assert exit_code == 1


def test_allow_empty_downgrades_empty_suite_to_warning(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_empty.py").write_text("# no tests yet\n")

    exit_code = run_demo_tests.main(
        ["--runtime-dir", str(tmp_path / "runtime"), "--allow-empty"],
        demo_root=demo_root,
    )

    assert exit_code == 0


def test_main_reports_durations_and_slowest_suites(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    demo_root = tmp_path / "demo"
    alpha_tests = demo_root / "alpha" / "tests"
    beta_tests = demo_root / "beta" / "tests"
    for tests_dir in (alpha_tests, beta_tests):
        tests_dir.mkdir(parents=True)

    suites: Iterable[run_demo_tests.Suite] = (
        run_demo_tests.Suite(demo_root=alpha_tests.parent, tests_dir=alpha_tests, runner="python"),
        run_demo_tests.Suite(demo_root=beta_tests.parent, tests_dir=beta_tests, runner="python"),
    )

    timings = iter([0.0, 0.25, 0.25, 1.0])
    monkeypatch.setattr(run_demo_tests, "_discover_tests", lambda *_, **__: suites)
    monkeypatch.setattr(run_demo_tests, "_run_suite", lambda *_, **__: 0)
    monkeypatch.setattr(run_demo_tests.time, "perf_counter", lambda: next(timings))

    exit_code = run_demo_tests.main(["--runtime-dir", str(tmp_path / "runtime")], demo_root=demo_root)

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "total 1.00s" in output
    assert "Slowest suites:" in output
    assert str(beta_tests) in output


def test_node_suites_run_in_ci_mode(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)

    suite = run_demo_tests.Suite(demo_root=demo_root, tests_dir=tests_dir, runner="node")
    captured_env: dict[str, str] = {}

    class _Result:
        returncode = 0

    def _fake_run(cmd: list[str], **kwargs: object) -> _Result:
        captured_env.update(kwargs.get("env", {}))
        return _Result()

    monkeypatch.setattr(subprocess, "run", _fake_run)

    exit_code = run_demo_tests._run_suite(suite, {}, timeout=1)

    assert exit_code == 0
    assert captured_env["CI"].lower() in {"1", "true"}
    assert captured_env["npm_config_progress"] == "false"
    assert captured_env["npm_config_fund"] == "false"


def test_vitest_suites_use_single_thread_pool(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "tests"
    tests_dir.mkdir(parents=True)
    (demo_root / "package.json").write_text('{"scripts": {"test": "vitest run"}}')

    suite = run_demo_tests.Suite(demo_root=demo_root, tests_dir=tests_dir, runner="node")
    commands: list[list[str]] = []

    class _Result:
        returncode = 0

    def _fake_run(cmd: list[str], **kwargs: object) -> _Result:
        commands.append(cmd)
        return _Result()

    monkeypatch.setattr(subprocess, "run", _fake_run)

    exit_code = run_demo_tests._run_suite(suite, {}, timeout=1)

    assert exit_code == 0
    assert commands
    command = commands[0]
    assert "--runInBand" not in command
    assert "--pool" in command


def test_node_suite_reports_missing_runner(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    demo_root = tmp_path / "node-demo"
    tests_dir = demo_root / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    suite = run_demo_tests.Suite(demo_root=demo_root, tests_dir=tests_dir, runner="node")

    # Remove PATH entries to force a FileNotFoundError for npm during the run.
    monkeypatch.setenv("PATH", str(tmp_path / "bin"))

    exit_code = run_demo_tests._run_suite(suite, env_overrides={})

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "npm" in captured.out
    assert "PATH" in captured.out
