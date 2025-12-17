from pathlib import Path

import demo.astral_omnidominion_operating_system.run_demo as run_demo


def test_build_command_forwards_args() -> None:
    cmd = run_demo.build_command(["--network", "localhost", "--yes"])

    assert cmd[:3] == ["npm", "run", "demo:agi-os:first-class"]
    assert cmd[3:] == ["--", "--network", "localhost", "--yes"]


def test_run_invokes_runner(monkeypatch) -> None:
    calls: list[tuple[list[str], str]] = []

    class DummyResult:
        def __init__(self, returncode: int) -> None:
            self.returncode = returncode

    def fake_runner(cmd, *, check, cwd):
        calls.append((cmd, cwd))
        return DummyResult(0)

    exit_code = run_demo.run(["--help"], runner=fake_runner)

    assert exit_code == 0
    assert calls[0][0][:4] == ["npm", "run", "demo:agi-os:first-class", "--"]
    assert Path(calls[0][1]) == run_demo.REPO_ROOT


def test_run_propagates_exit_code(monkeypatch) -> None:
    def failing_runner(cmd, *, check, cwd):  # noqa: ARG001
        class DummyResult:
            returncode = 7

        return DummyResult()

    assert run_demo.run([], runner=failing_runner) == 7


def test_run_autofills_non_interactive_defaults(monkeypatch) -> None:
    recorded: list[list[str]] = []

    def fake_runner(cmd, *, check, cwd):  # noqa: ARG001
        recorded.append(cmd)

        class DummyResult:
            returncode = 0

        return DummyResult()

    def always_false():
        return False

    run_demo.run([], runner=fake_runner, is_interactive=always_false)

    assert recorded[0][:3] == ["npm", "run", "demo:agi-os:first-class"]
    assert recorded[0][3:] == [
        "--",
        "--network",
        "localhost",
        "--yes",
        "--no-compose",
        "--skip-deploy",
    ]


def test_auto_flag_skips_prompt_even_when_interactive(monkeypatch) -> None:
    recorded: list[list[str]] = []

    def fake_runner(cmd, *, check, cwd):  # noqa: ARG001
        recorded.append(cmd)

        class DummyResult:
            returncode = 0

        return DummyResult()

    def always_true():
        return True

    run_demo.run(["--auto"], runner=fake_runner, is_interactive=always_true)

    assert recorded[0][:3] == ["npm", "run", "demo:agi-os:first-class"]
    assert "--network" in recorded[0]
    assert "--yes" in recorded[0]


def test_env_flag_enables_automation(monkeypatch) -> None:
    recorded: list[list[str]] = []

    def fake_runner(cmd, *, check, cwd):  # noqa: ARG001
        recorded.append(cmd)

        class DummyResult:
            returncode = 0

        return DummyResult()

    def always_true():
        return True

    monkeypatch.setenv(run_demo.AUTO_ENV, "true")

    run_demo.run([], runner=fake_runner, is_interactive=always_true)

    assert recorded[0][:3] == ["npm", "run", "demo:agi-os:first-class"]
    assert "--network" in recorded[0]
    assert "--skip-deploy" in recorded[0]
