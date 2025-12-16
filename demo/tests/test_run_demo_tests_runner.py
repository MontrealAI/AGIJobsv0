from __future__ import annotations

import os
from pathlib import Path

import pytest

from demo import run_demo_tests


def test_suite_runtime_root_uses_demo_and_relative_path(tmp_path: Path) -> None:
    demo_a = tmp_path / "demo-a"
    demo_b = tmp_path / "demo-b"
    for demo in (demo_a, demo_b):
        tests_dir = demo / "nested" / "tests"
        tests_dir.mkdir(parents=True)

    suite_a = run_demo_tests._suite_runtime_root(tmp_path, demo_a, demo_a / "nested" / "tests")
    suite_b = run_demo_tests._suite_runtime_root(tmp_path, demo_b, demo_b / "nested" / "tests")

    assert suite_a != suite_b
    assert suite_a.relative_to(tmp_path) == Path("demo-a/nested/tests")
    assert suite_b.relative_to(tmp_path) == Path("demo-b/nested/tests")


def test_main_respects_runtime_dir_option(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    test_file = tests_dir / "test_ok.py"
    test_file.write_text("def test_ok():\n    assert True\n")

    runtime_dir = tmp_path / "runtime"

    exit_code = run_demo_tests.main(["--runtime-dir", str(runtime_dir)], demo_root=demo_root)

    assert exit_code == 0
    sandbox = runtime_dir / "example" / "tests" / "orchestrator"
    assert sandbox.exists()
    assert (sandbox / "agents").exists()


def test_main_clears_existing_runtime_dir(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_ok.py").write_text("def test_ok():\n    assert True\n")

    runtime_dir = tmp_path / "runtime"
    stale_artifact = runtime_dir / "example" / "tests" / "orchestrator" / "checkpoint.json"
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
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=nested_project, tests_dir=tests_dir, runner="node"
        )
    ]
