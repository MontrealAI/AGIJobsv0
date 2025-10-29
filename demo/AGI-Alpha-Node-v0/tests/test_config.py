from pathlib import Path

import pytest

from alpha_node.config import AlphaNodeConfig


def test_config_from_file(tmp_path: Path) -> None:
    cfg = tmp_path / "alpha-node.yaml"
    cfg.write_text(
        """
identity:
  ens_domain: demo.alpha.node.agi.eth
  operator_address: "0x000000000000000000000000000000000000dEaD"
  governance_address: "0x000000000000000000000000000000000000bEEF"
  rpc_url: https://example.invalid
security:
  emergency_contact: ops@example
  pause_contract: "0x000000000000000000000000000000000000c0DE"
staking:
  stake_manager_address: "0x0000000000000000000000000000000000005TaK"
  min_stake_wei: 1000
  reward_tokens:
    - symbol: AGIALPHA
      address: "0x000000000000000000000000000000000000A610"
jobs:
  job_router_address: "0x0000000000000000000000000000000000000B55"
  poll_interval_seconds: 10
planner:
  search_depth: 3
  exploration_constant: 1.1
metrics:
  prometheus_port: 8000
  dashboard_port: 8001
storage:
  knowledge_path: "./knowledge.db"
  logs_path: "./logs.jsonl"
""",
        encoding="utf-8",
    )
    config = AlphaNodeConfig.from_file(cfg)
    assert config.identity.ens_domain == "demo.alpha.node.agi.eth"
    assert config.staking.reward_tokens[0].symbol == "AGIALPHA"
    assert config.metrics.prometheus_port == 8000
    assert config.storage.knowledge_path.name == "knowledge.db"


def test_config_missing(tmp_path: Path) -> None:
    missing = tmp_path / "missing.yaml"
    with pytest.raises(FileNotFoundError):
        AlphaNodeConfig.from_file(missing)
