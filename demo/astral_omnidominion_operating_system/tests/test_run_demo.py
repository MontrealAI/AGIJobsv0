"""Compatibility import and direct-file shim contracts, using inert runners."""
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

PACKAGE_PARENT = Path(__file__).resolve().parents[2]
if str(PACKAGE_PARENT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_PARENT))

import astral_omnidominion_operating_system.run_demo as compatibility
from astral_omnidominion_operating_system import run_demo as package_entrypoint


EXECUTE_ARGS = ["--mode", "execute", "--network", "localhost", "--no-compose", "--yes"]


def _load_direct_shim():
    path = Path(__file__).resolve().parents[1] / "run_demo.py"
    spec = importlib.util.spec_from_file_location("astral_direct_file_shim", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(params=[compatibility, package_entrypoint, _load_direct_shim()])
def entrypoint(request):
    return request.param


def test_run_delegates_to_primary_entrypoint(entrypoint):
    calls = []

    def runner(cmd, *, check, cwd):
        calls.append((cmd, check, cwd))
        return SimpleNamespace(returncode=42)

    exit_code = entrypoint.run(iter(EXECUTE_ARGS), runner=runner, is_interactive=lambda: pytest.fail("Unexpected TTY probe"))
    assert exit_code == 42
    assert len(calls) == 1
    cmd, check, cwd = calls[0]
    assert cmd == ["npm", "run", "demo:agi-os:first-class", "--", *EXECUTE_ARGS]
    assert check is False
    assert Path(cwd).resolve() == Path(__file__).resolve().parents[3]


@pytest.mark.parametrize("args", [[], ["--dry-run"], ["--mode", "plan"], ["--help"], ["-h"], ["-?"]])
def test_plan_and_help_do_not_delegate_to_runner(entrypoint, args, monkeypatch, capsys):
    monkeypatch.setenv("CI", "true")
    monkeypatch.setenv("ASTRAL_OS_AUTO", "true")

    def forbidden(*args, **kwargs):
        pytest.fail("Plan/help must remain local")

    monkeypatch.setattr("subprocess.run", forbidden)
    assert entrypoint.run(args, runner=forbidden, is_interactive=forbidden) == 0
    output = capsys.readouterr()
    assert "Astral Omnidominion" in output.out
    assert not output.err


@pytest.mark.parametrize("args", [["--mission", "alpha"], ["--auto"], ["--auto-yes"], EXECUTE_ARGS[:-1], ["--help", "--yes"]])
def test_compatibility_cannot_bypass_validation(entrypoint, args, capsys):
    def forbidden(*args, **kwargs):
        pytest.fail("Invalid arguments must be rejected locally")

    assert entrypoint.run(args, runner=forbidden, is_interactive=forbidden) == 2
    assert capsys.readouterr().err.startswith("Error:")
    with pytest.raises(ValueError):
        entrypoint.build_command(args)


def test_build_command_is_available_through_all_imports(entrypoint):
    assert entrypoint.build_command(EXECUTE_ARGS) == ["npm", "run", "demo:agi-os:first-class", "--", *EXECUTE_ARGS]
