from __future__ import annotations

import types
from pathlib import Path

import pytest

from demo import run_demo_tests


@pytest.fixture()
def demo_workspace(tmp_path: Path) -> Path:
    alpha = tmp_path / "alpha-demo"
    alpha_tests = alpha / "tests"
    alpha_tests.mkdir(parents=True)
    (alpha_tests / "test_alpha.py").write_text("def test_alpha():\n    assert True\n")

    beta = tmp_path / "beta-suite"
    beta_tests = beta / "tests"
    beta_tests.mkdir(parents=True)
    (beta_tests / "test_beta.py").write_text("def test_beta():\n    assert True\n")

    empty = tmp_path / "empty-demo"
    empty_tests = empty / "tests"
    empty_tests.mkdir(parents=True)
    (empty_tests / "nontest.txt").write_text("not a test file")

    return tmp_path


def test_discover_tests_filters_by_name(demo_workspace: Path) -> None:
    discovered = list(
        run_demo_tests._discover_tests(demo_workspace, include={"alpha"})
    )
    assert len(discovered) == 1
    assert discovered[0][0].name == "alpha-demo"


def test_discover_tests_skips_non_python_suites(demo_workspace: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _ = list(run_demo_tests._discover_tests(demo_workspace))
    captured = capsys.readouterr().out
    assert "Skipping" in captured
    assert "empty-demo/tests" in captured


def test_main_reports_missing_filters(demo_workspace: Path) -> None:
    code = run_demo_tests.main(["--demo", "does-not-exist"], demo_root=demo_workspace)
    assert code == 1


def test_list_flag_does_not_execute_suites(monkeypatch: pytest.MonkeyPatch, demo_workspace: Path, capsys: pytest.CaptureFixture[str]) -> None:
    called = types.SimpleNamespace(count=0)

    def fake_run_suite(*_: object) -> int:  # pragma: no cover - should not be invoked
        called.count += 1
        return 0

    monkeypatch.setattr(run_demo_tests, "_run_suite", fake_run_suite)

    code = run_demo_tests.main(["--list"], demo_root=demo_workspace)

    assert code == 0
    assert called.count == 0
    out = capsys.readouterr().out
    assert "Discovered demo test suites" in out
    assert "alpha-demo/tests" in out
    assert "beta-suite/tests" in out
