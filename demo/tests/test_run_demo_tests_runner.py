from pathlib import Path

from demo import run_demo_tests


def test_discover_tests_skips_virtualenvs(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo-root"
    good_suite = demo_root / "alpha"
    good_tests = good_suite / "tests"
    good_tests.mkdir(parents=True)
    (good_tests / "test_ok.py").write_text("def test_ok():\n    assert True\n")

    venv_tests = demo_root / ".venv" / "pkg" / "tests"
    venv_tests.mkdir(parents=True)
    (venv_tests / "test_ignore.py").write_text("def test_ignore():\n    assert False\n")

    discovered = list(run_demo_tests._discover_tests(demo_root))

    assert discovered == [(good_suite, good_tests)]


def test_run_suite_timeout(tmp_path: Path) -> None:
    demo_root = tmp_path / "omega"
    tests_dir = demo_root / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_sleep.py").write_text(
        "import time\n\n" "def test_sleep():\n    time.sleep(0.5)\n"
    )

    exit_code = run_demo_tests._run_suite(demo_root, tests_dir, {}, timeout=0.1)

    assert exit_code == 1
