from pathlib import Path

from click.testing import CliRunner
import yaml

from agi_alpha_node_demo.cli import cli


def test_bootstrap_and_status(tmp_path: Path):
    config_template = yaml.safe_load(Path("demo/AGI-Alpha-Node-v0/config.example.yaml").read_text())
    config_template["knowledge_lake"]["database_path"] = str(tmp_path / "knowledge.sqlite3")
    config_template["operator"]["pause_key_path"] = str(tmp_path / "pause.key")
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(config_template))

    runner = CliRunner()
    result = runner.invoke(cli, ["--config", str(config_path), "bootstrap", "--non-interactive"])
    assert result.exit_code == 0, result.output

    status = runner.invoke(cli, ["--config", str(config_path), "status"])
    assert status.exit_code == 0, status.output
    assert "ENS" in status.output
