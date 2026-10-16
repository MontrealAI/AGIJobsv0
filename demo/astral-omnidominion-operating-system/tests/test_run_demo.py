"""Unit tests use injected runners only; no npm, deployment or RPC is run."""
from pathlib import Path
from types import SimpleNamespace

import pytest

import demo.astral_omnidominion_operating_system.run_demo as run_demo


EXECUTE_ARGS = ["--mode", "execute", "--network", "localhost", "--no-compose", "--yes"]


def forbidden_runner(*args, **kwargs):
    pytest.fail("Plan, help and invalid input must never invoke a runner")


def forbidden_probe():
    pytest.fail("TTY state must not be consulted for consent")


@pytest.mark.parametrize("args", [[], ["--mode", "plan"], ["--dry-run"], ["--help"], EXECUTE_ARGS])
def test_build_command_validates_and_forwards_exact_args(args):
    original = list(args)
    assert run_demo.build_command(iter(args)) == ["npm", "run", "demo:agi-os:first-class", "--", *original]
    assert args == original


@pytest.mark.parametrize(
    "args",
    [
        [],
        ["--mode", "plan"],
        ["--dry-run"],
        ["--network", "sepolia", "--no-compose", "--skip-deploy", "--yes", "--non-interactive"],
        ["--mode", "plan", "--network", "localhost", "--compose", "--yes"],
    ],
)
def test_plan_is_effect_free_and_describes_intent(args, monkeypatch, capsys):
    monkeypatch.setattr(run_demo.subprocess, "run", forbidden_runner)
    assert run_demo.run(args, runner=forbidden_runner, is_interactive=forbidden_probe) == 0
    output = capsys.readouterr()
    assert "plan (effect-free preview)" in output.out
    assert "No subprocesses, RPC calls, deployment, filesystem writes or reports" in output.out
    assert "--mode execute" in output.out
    assert "skips only the first-class deployment wizard; owner/runtime commands still run" in output.out
    assert "separate in-memory Hardhat fixture; it does not\nverify the selected localhost/Sepolia deployment" in output.out
    assert "Sepolia outer path is available in source but remains operationally unqualified" in output.out
    assert not output.err
    if "sepolia" in args:
        assert "Network: sepolia" in output.out
        assert "Docker Compose: disabled" in output.out
        assert "Deployment: first-class wizard skipped" in output.out


@pytest.mark.parametrize("flag", ["-h", "-?", "--help"])
def test_help_is_local_and_documents_execution_gate(flag, monkeypatch, capsys):
    monkeypatch.setattr(run_demo.subprocess, "run", forbidden_runner)
    assert run_demo.run([flag], runner=forbidden_runner, is_interactive=forbidden_probe) == 0
    output = capsys.readouterr()
    for expected in ["Usage:", "--mode plan|execute", "--dry-run", "--yes", "--no-compose", "--skip-deploy"]:
        assert expected in output.out
    assert "Never substitutes for --yes" in output.out
    assert "skips only the first-class deployment wizard; owner/runtime commands still run" in output.out
    assert "separate in-memory Hardhat fixture; it does not\nverify the selected localhost/Sepolia deployment" in output.out
    assert "Sepolia outer path is available in source but remains operationally unqualified" in output.out
    assert not output.err


INVALID_ARGS = [
    ["--unknown"],
    ["mission"],
    ["--"],
    [""],
    ["--mode"],
    ["--network"],
    ["--mode", "--yes"],
    ["--network", "--yes"],
    ["--mode", ""],
    ["--network", ""],
    ["--mode", "dry-run"],
    ["--mode", "EXECUTE"],
    ["--network", "mainnet"],
    ["--network", "https://example.invalid"],
    ["--network", "LOCALHOST"],
    ["--yes", "false"],
    ["--compose", "false"],
    ["--non-interactive", "true"],
    ["--mode", "plan", "--dry-run"],
    ["--dry-run", "--mode", "execute"],
    ["--compose", "--no-compose"],
    ["--no-compose", "--compose"],
    ["--skip-deploy", "--compose"],
    ["--compose", "--skip-deploy"],
    ["--mode", "execute"],
    ["--mode", "execute", "--yes", "--no-compose"],
    ["--mode", "execute", "--network", "localhost", "--yes"],
    ["--mode", "execute", "--network", "sepolia", "--compose"],
    ["--mode", "execute", "--network", "localhost", "--no-compose", "--non-interactive"],
    ["--auto"],
    ["--auto-yes"],
    [*EXECUTE_ARGS, "--typo"],
    [*EXECUTE_ARGS, "false"],
]
INVALID_ARGS += [[flag, flag] for flag in ["--dry-run", "--yes", "--non-interactive", "--compose", "--no-compose", "--skip-deploy"]]
INVALID_ARGS += [[flag, value, flag, value] for flag, value in [("--mode", "plan"), ("--network", "localhost")]]
INVALID_ARGS += [[f"{flag}={value}"] for flag, value in [("--mode", "execute"), ("--network", "localhost"), ("--yes", "true"), ("--non-interactive", "true"), ("--compose", "true"), ("--no-compose", "true"), ("--skip-deploy", "true"), ("--dry-run", "true")]]
INVALID_ARGS += [[flag, "--yes"] for flag in ["-h", "-?", "--help"]]
INVALID_ARGS += [["--help", "--help"], ["--mode", "execute", "--help"]]


@pytest.mark.parametrize("args", INVALID_ARGS)
def test_invalid_input_rejected_before_runner_or_command(args, monkeypatch, capsys):
    monkeypatch.setattr(run_demo.subprocess, "run", forbidden_runner)
    monkeypatch.setenv("CI", "true")
    monkeypatch.setenv("ASTRAL_OS_AUTO", "true")
    with pytest.raises(ValueError):
        run_demo.build_command(iter(args))
    assert run_demo.run(args, runner=forbidden_runner, is_interactive=forbidden_probe) == 2
    output = capsys.readouterr()
    assert output.err.startswith("Error:")
    assert not output.out


@pytest.mark.parametrize("value", ["1", "true", "yes", "on", "false", "0", ""])
def test_environment_and_non_tty_never_inject_consent(value, monkeypatch, capsys):
    monkeypatch.setenv("CI", value)
    monkeypatch.setenv("ASTRAL_OS_AUTO", value)
    monkeypatch.setattr(run_demo.subprocess, "run", forbidden_runner)
    monkeypatch.setattr(run_demo.sys, "stdin", SimpleNamespace(isatty=forbidden_probe))
    assert run_demo.run([], runner=forbidden_runner) == 0
    assert "not selected" in capsys.readouterr().out
    assert run_demo.run(EXECUTE_ARGS[:-1], runner=forbidden_runner) == 2
    assert "requires --yes" in capsys.readouterr().err


@pytest.mark.parametrize("network", ["localhost", "sepolia"])
@pytest.mark.parametrize("compose", ["--compose", "--no-compose"])
@pytest.mark.parametrize("exit_code", [0, 7])
def test_explicit_execute_preserves_argv_and_runner_result(network, compose, exit_code):
    args = ["--yes", "--network", network, compose, "--non-interactive", "--mode", "execute"]
    calls = []

    def fake_runner(cmd, *, check, cwd):
        calls.append((cmd, check, cwd))
        return SimpleNamespace(returncode=exit_code)

    assert run_demo.run(iter(args), runner=fake_runner, is_interactive=forbidden_probe) == exit_code
    assert calls == [(["npm", "run", "demo:agi-os:first-class", "--", *args], False, str(run_demo.REPO_ROOT))]
    assert Path(calls[0][2]).resolve() == Path(__file__).resolve().parents[3]


def test_skip_deploy_execute_still_requires_and_uses_runner():
    calls = []
    args = [*EXECUTE_ARGS, "--skip-deploy"]

    def fake_runner(cmd, **kwargs):
        calls.append(cmd)
        return SimpleNamespace(returncode=42)

    assert run_demo.run(args, runner=fake_runner) == 42
    assert calls == [run_demo.build_command(args)]


def test_sys_argv_is_supported_without_adding_defaults(monkeypatch):
    monkeypatch.setattr(run_demo.sys, "argv", ["run_demo.py", *EXECUTE_ARGS])
    calls = []

    def fake_runner(cmd, **kwargs):
        calls.append(cmd)
        return SimpleNamespace(returncode=0)

    assert run_demo.run(runner=fake_runner) == 0
    assert calls == [run_demo.build_command(EXECUTE_ARGS)]
