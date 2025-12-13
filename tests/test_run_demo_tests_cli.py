from demo import run_demo_tests


def test_include_alias_populates_demo_list():
    args = run_demo_tests._parse_args(["--include", "alpha"])
    assert args.demo == ["alpha"]


def test_demo_flag_still_supported():
    args = run_demo_tests._parse_args(["--demo", "beta"])
    assert args.demo == ["beta"]
