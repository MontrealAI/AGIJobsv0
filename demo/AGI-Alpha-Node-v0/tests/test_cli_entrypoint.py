from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from pathlib import Path

import pytest

DEMO_ROOT = Path(__file__).resolve().parents[1]
for module in ("alpha_node", "alpha_node.config", "alpha_node.node"):
    sys.modules.pop(module, None)

SRC_DIR = DEMO_ROOT / "src"
for path in (SRC_DIR, DEMO_ROOT):
    path_str = str(path)
    if path_str in sys.path:
        sys.path.remove(path_str)
    sys.path.insert(0, path_str)

MODULE_PATH = DEMO_ROOT / "run_alpha_node.py"
spec = importlib.util.spec_from_file_location("agi_alpha_node_cli", MODULE_PATH)
if spec is None or spec.loader is None:  # pragma: no cover
    raise RuntimeError("Unable to load run_alpha_node module")
run_alpha_node = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_alpha_node)


@pytest.fixture()
def temp_config(tmp_path: Path) -> Path:
    demo_root = Path(__file__).resolve().parents[1]
    for filename in ["config.toml", "jobs.json", "knowledge.json", "ens_registry.csv"]:
        shutil.copy(demo_root / filename, tmp_path / filename)
    return tmp_path / "config.toml"


def test_status_action_runs_without_prompts(temp_config: Path, capsys: pytest.CaptureFixture[str]):
    exit_code = run_alpha_node.main(["--config", str(temp_config), "--action", "status"])
    assert exit_code == 0

    output = capsys.readouterr().out
    # A status snapshot should include state keys rather than an argparse error.
    assert "AGI Alpha Node Command Bridge" in output
    assert "stake_locked" in output


def test_run_once_bootstraps_and_executes(temp_config: Path, capsys: pytest.CaptureFixture[str]):
    exit_code = run_alpha_node.main(["--config", str(temp_config), "--action", "run-once"])
    assert exit_code == 0

    output = capsys.readouterr().out
    payload = json.loads(output[output.index("{") : output.rindex("}") + 1])
    assert "decisions" in payload
    assert payload["decisions"]
