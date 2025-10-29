from pathlib import Path

import pytest

from alpha_node.config import AlphaNodeConfig


def test_config_load(tmp_path: Path) -> None:
    cfg = tmp_path / "config.yaml"
    cfg.write_text(
        """
identity:
  ens_domain: demo.alpha.node.agi.eth
  owner_address: "0xabc"

governance:
  governance_address: "0xdef"

economy:
  stake_threshold: 10

network:
  rpc_url: "https://example.invalid"

contracts:
  job_registry: "0x1"
  stake_manager: "0x2"
  incentives: "0x3"
  treasury: "0x4"

storage:
  knowledge_lake: "knowledge.json"
  log_file: "logs/alpha.log"
""",
        encoding="utf-8",
    )
    config = AlphaNodeConfig.load(cfg)
    assert config.ens_domain == "demo.alpha.node.agi.eth"
    assert config.knowledge_path.name == "knowledge.json"
    assert config.log_path.name == "alpha.log"


def test_config_missing_section(tmp_path: Path) -> None:
    cfg = tmp_path / "config.yaml"
    cfg.write_text("identity: {}\n", encoding="utf-8")
    with pytest.raises(ValueError):
        AlphaNodeConfig.load(cfg)
