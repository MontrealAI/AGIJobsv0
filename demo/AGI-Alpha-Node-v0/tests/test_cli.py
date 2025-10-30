from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from agi_alpha_node_demo.cli.main import app

RUNNER = CliRunner()


def _prepare_config(tmp_path: Path) -> Path:
    repo_root = Path(__file__).resolve().parents[1]
    source = repo_root / "config" / "alpha_node.example.yml"
    dest = tmp_path / "alpha_node.yml"
    dest.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
    return dest


def test_cli_bootstrap(tmp_path: Path) -> None:
    config_path = _prepare_config(tmp_path)
    result = RUNNER.invoke(app, ["bootstrap", "--config", str(config_path), "--offline"])
    assert result.exit_code == 0
    assert "\"verified\": true" in result.stdout.lower()


def test_cli_run_once(tmp_path: Path) -> None:
    config_path = _prepare_config(tmp_path)
    result = RUNNER.invoke(app, ["run", "--config", str(config_path), "--offline", "--once"])
    assert result.exit_code == 0
    assert "\"results\"" in result.stdout
