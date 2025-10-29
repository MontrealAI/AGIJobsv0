from pathlib import Path

import pytest

from agi_alpha_node.config import AlphaNodeConfig


def test_config_loads_and_resolves(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
ens:
  name: demo.alpha.node.agi.eth
  operator_address: "0x0000000000000000000000000000000000000001"
  fallback_registry_file: "ens.json"
staking:
  stake_manager_address: "0x1"
  minimum_stake: 5
  auto_reinvest: false
jobs:
  router_address: "0x2"
  registry_address: "0x3"
  poll_interval_seconds: 10
  eligibility_threshold: 0.7
planner:
  horizon: 3
  exploration_constant: 1.2
  risk_aversion: 0.3
specialists: []
knowledge_lake:
  database_path: knowledge/alpha.db
  embedding_dimension: 8
metrics:
  prometheus_port: 9109
  dashboard_port: 8080
  log_file: logs/node.jsonl
safety:
  enable_automatic_pause: true
  pause_on_failed_ens: true
  pause_on_slash_risk: true
  drill_interval_minutes: 60
""",
        encoding="utf-8",
    )
    cfg = AlphaNodeConfig.load(config_path)
    resolved = cfg.resolved_log_file(config_path.parent)
    assert resolved is not None and resolved.name == "node.jsonl"
    knowledge_path = cfg.resolve_path(cfg.knowledge_lake.database_path)
    assert knowledge_path.parent.name == "knowledge"


def test_config_validates_specialist_class_path(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
ens:
  name: demo.alpha.node.agi.eth
  operator_address: "0x0000000000000000000000000000000000000001"
staking:
  stake_manager_address: "0x1"
  minimum_stake: 5
jobs:
  router_address: "0x2"
  registry_address: "0x3"
planner:
  horizon: 3
  exploration_constant: 1.2
  risk_aversion: 0.3
specialists:
  - name: finance
    class_path: agi_alpha_node.specialists.finance:FinanceStrategist
    capabilities: []
knowledge_lake:
  database_path: knowledge.db
metrics:
  prometheus_port: 9109
  dashboard_port: 8080
safety:
  enable_automatic_pause: true
  pause_on_failed_ens: true
  pause_on_slash_risk: true
  drill_interval_minutes: 60
""",
        encoding="utf-8",
    )
    cfg = AlphaNodeConfig.load(config_path)
    assert cfg.specialists[0].class_path.endswith("FinanceStrategist")

    bad_config = config_path.with_name("bad.yaml")
    bad_config.write_text(config_path.read_text().replace(":FinanceStrategist", "FinanceStrategist"), encoding="utf-8")
    with pytest.raises(ValueError):
        AlphaNodeConfig.load(bad_config)
