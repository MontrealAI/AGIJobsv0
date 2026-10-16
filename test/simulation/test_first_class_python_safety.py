"""Cross-entrypoint safety regression tests with injected, inert runners only."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
ENTRYPOINTS = [
    ROOT / "demo/astral-omnidominion-operating-system/run_demo.py",
    ROOT / "demo/astral_omnidominion_operating_system/run_demo.py",
]


@pytest.fixture(params=ENTRYPOINTS, ids=["canonical", "compatibility-file"])
def entrypoint(request):
    spec = importlib.util.spec_from_file_location("astral_safety_fixture", request.param)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def forbidden(*args, **kwargs):
    pytest.fail("No operational effects or terminal probes are allowed")


@pytest.mark.parametrize(
    "args,expected",
    [
        ([], 0),
        (["--mode", "plan", "--network", "sepolia", "--no-compose", "--yes"], 0),
        (["--dry-run", "--network", "localhost", "--compose"], 0),
        (["--help"], 0),
        (["-?"], 0),
        (["--mode", "execute", "--network", "localhost", "--no-compose", "--non-interactive"], 2),
        (["--auto"], 2),
        (["--auto-yes"], 2),
        (["--help", "--network", "sepolia"], 2),
        (["--mode=plan"], 2),
        (["--dry-run", "--mode", "plan"], 2),
        (["--mode", "execute", "--network", "localhost", "--compose", "--yes", "--skip-deploy"], 2),
        (["--mode", "execute", "--network", "localhost", "--no-compose", "--yes", "--yes"], 2),
    ],
)
def test_all_non_execution_paths_stay_inert(entrypoint, args, expected, monkeypatch, tmp_path, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CI", "true")
    monkeypatch.setenv("ASTRAL_OS_AUTO", "true")
    monkeypatch.setattr("subprocess.run", forbidden)
    monkeypatch.setattr("subprocess.Popen", forbidden)
    monkeypatch.setattr("sys.stdin", SimpleNamespace(isatty=forbidden))
    assert entrypoint.run(args, runner=forbidden, is_interactive=forbidden) == expected
    assert list(tmp_path.iterdir()) == []
    output = capsys.readouterr()
    assert bool(output.err) == (expected != 0)
    if expected == 0:
        assert "Astral Omnidominion" in output.out


@pytest.mark.parametrize("args", [
    ["--mode", "execute", "--network", "localhost", "--no-compose", "--yes", "--skip-deploy"],
    ["--network", "sepolia", "--yes", "--compose", "--mode", "execute", "--non-interactive"],
])
def test_only_explicit_execute_reaches_injected_runner(entrypoint, args, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("subprocess.run", forbidden)
    monkeypatch.setattr("subprocess.Popen", forbidden)
    calls = []

    def stub(cmd, *, check, cwd):
        calls.append((cmd, check, cwd))
        return SimpleNamespace(returncode=17)

    assert entrypoint.run(args, runner=stub, is_interactive=forbidden) == 17
    assert calls == [(["npm", "run", "demo:agi-os:first-class", "--", *args], False, str(ROOT))]
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("args,expected", [([], 0), (["--help"], 0), (["--dry-run"], 0), (["--unknown"], 2)])
def test_compatibility_dynamic_load_never_attempts_bytecode_writes(monkeypatch, args, expected):
    """Do not hide dynamic-loader side effects behind PYTHONDONTWRITEBYTECODE."""
    from importlib.machinery import SourceFileLoader
    from types import ModuleType
    import sys

    with monkeypatch.context() as scoped:
        scoped.setattr(sys, "dont_write_bytecode", False)
        scoped.setattr(SourceFileLoader, "set_data", forbidden)
        original_get_data = SourceFileLoader.get_data

        def force_bytecode_cache_miss(loader, path):
            if str(path).endswith(".pyc"):
                raise FileNotFoundError(path)
            return original_get_data(loader, path)

        # A valid pre-existing .pyc must not let the old exec_module implementation
        # bypass set_data and make this regression test pass accidentally.
        scoped.setattr(SourceFileLoader, "get_data", force_bytecode_cache_miss)
        shim_path = ENTRYPOINTS[1]
        shim = ModuleType("inert_direct_astral_shim")
        shim.__file__ = str(shim_path)
        # Simulate direct-script source execution without asking the test harness
        # itself to import/cache that shim. Its owned nested loader must stay inert.
        exec(compile(shim_path.read_bytes(), str(shim_path), "exec"), shim.__dict__)
        assert shim.run(args, runner=forbidden, is_interactive=forbidden) == expected


def test_package_owned_loader_never_attempts_canonical_bytecode_writes(monkeypatch):
    from importlib.machinery import SourceFileLoader
    from types import ModuleType
    import sys

    with monkeypatch.context() as scoped:
        scoped.setattr(sys, "dont_write_bytecode", False)
        scoped.setattr(SourceFileLoader, "set_data", forbidden)
        original_get_data = SourceFileLoader.get_data

        def force_bytecode_cache_miss(loader, path):
            if str(path).endswith(".pyc"):
                raise FileNotFoundError(path)
            return original_get_data(loader, path)

        # A valid pre-existing .pyc must not let the old exec_module implementation
        # bypass set_data and make this regression test pass accidentally.
        scoped.setattr(SourceFileLoader, "get_data", force_bytecode_cache_miss)
        package_path = ROOT / "demo/astral_omnidominion_operating_system/__init__.py"
        package = ModuleType("inert_astral_package")
        package.__file__ = str(package_path)
        original_modules = dict(sys.modules)
        try:
            exec(compile(package_path.read_bytes(), str(package_path), "exec"), package.__dict__)
            assert package.run_demo.run(["--help"], runner=forbidden) == 0
        finally:
            for key in ("astral_omnidominion.run_demo", "inert_astral_package.run_demo"):
                if key in original_modules:
                    sys.modules[key] = original_modules[key]
                else:
                    sys.modules.pop(key, None)
