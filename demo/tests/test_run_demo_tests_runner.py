from __future__ import annotations

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
