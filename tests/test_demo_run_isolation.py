from pathlib import Path

from demo import run_demo_tests


def test_suite_runtime_root_is_unique(tmp_path: Path) -> None:
    """Ensure demo sandboxes do not collide when test paths share names."""

    demo_a = tmp_path / "demo_a"
    demo_b = tmp_path / "demo_b"
    tests_dir_a = demo_a / "grand_demo" / "tests"
    tests_dir_b = demo_b / "grand_demo" / "tests"

    # The directories don't need real content; we just need representative paths
    # for the relative path calculation inside ``_suite_runtime_root``.
    tests_dir_a.mkdir(parents=True)
    tests_dir_b.mkdir(parents=True)

    runtime_root = tmp_path / "runtime"

    path_a = run_demo_tests._suite_runtime_root(runtime_root, demo_a, tests_dir_a)
    path_b = run_demo_tests._suite_runtime_root(runtime_root, demo_b, tests_dir_b)

    assert path_a != path_b
    assert path_a == runtime_root / "demo_a" / "grand_demo" / "tests"
    assert path_b == runtime_root / "demo_b" / "grand_demo" / "tests"
