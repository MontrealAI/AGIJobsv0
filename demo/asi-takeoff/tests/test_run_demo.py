from pathlib import Path
import importlib.util
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "run_demo.py"


def load_module():
    spec = importlib.util.spec_from_file_location("asi_takeoff.run_demo", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)  # type: ignore[arg-type]
    return module


def test_build_env_uses_defaults(tmp_path: Path) -> None:
    run_demo = load_module()
    cfg = run_demo.DemoConfig().with_defaults()
    env = run_demo._build_env(cfg)

    assert env["NETWORK"] == "localhost"
    assert env["AURORA_REPORT_SCOPE"] == "asi-takeoff"
    assert env["AURORA_REPORT_TITLE"].startswith("ASI Take-Off")
    assert env["AURORA_DEPLOY_OUTPUT"].endswith("deploy.json")


def test_validate_files_detects_missing(tmp_path: Path) -> None:
    run_demo = load_module()
    missing = tmp_path / "missing.json"
    with pytest.raises(SystemExit):
        run_demo._validate_files([missing])


def test_validate_files_accepts_existing(tmp_path: Path) -> None:
    run_demo = load_module()
    present = tmp_path / "present.json"
    present.write_text("{}")
    result = run_demo._validate_files([present])
    assert result == [present]


def test_generator_inputs_are_preserved_and_directories_rejected(tmp_path: Path) -> None:
    module = load_module()
    present = tmp_path / "asset.json"
    present.write_text("{}")
    assert module._validate_files(p for p in [present]) == [present]
    with pytest.raises(SystemExit):
        module._validate_files([tmp_path])


@pytest.mark.parametrize("network,scope", [("mainnet", "asi-takeoff"), ("localhost", "../escape"), ("localhost", "..")])
def test_local_launcher_rejects_misleading_network_and_scope(network, scope) -> None:
    with pytest.raises(ValueError):
        load_module().DemoConfig(network=network, report_scope=scope).with_defaults()


def test_relative_overrides_are_absolute_before_shell_changes_directory(tmp_path: Path, monkeypatch) -> None:
    module = load_module()
    monkeypatch.chdir(tmp_path)
    env = module._build_env(module.DemoConfig(mission_config=Path("mission.json"), thermostat_config=Path("thermostat.json"), deploy_output=Path("deploy.json")))
    assert env["AURORA_MISSION_CONFIG"] == str(tmp_path / "mission.json")
    assert env["AURORA_DEPLOY_OUTPUT"] == str(tmp_path / "deploy.json")


def test_missing_command_has_nonzero_exit(monkeypatch) -> None:
    module = load_module()
    monkeypatch.setattr(module.shutil, "which", lambda command: None)
    with pytest.raises(SystemExit) as error:
        module.check()
    assert error.value.code == 1
