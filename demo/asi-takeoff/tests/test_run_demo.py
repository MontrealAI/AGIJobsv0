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
