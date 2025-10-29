from pathlib import Path

from agi_alpha_node.config import AlphaNodeConfig
from agi_alpha_node.knowledge import KnowledgeLake
from agi_alpha_node.orchestrator import Orchestrator
from agi_alpha_node.safety import SafetyManager
from agi_alpha_node.staking import StakeManagerClient


def _write_config(tmp_path: Path) -> Path:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
ens:
  name: demo.alpha.node.agi.eth
  operator_address: "0x0000000000000000000000000000000000000001"
  fallback_registry_file: "ens.json"
staking:
  stake_manager_address: "0x1"
  minimum_stake: 1
jobs:
  router_address: "0x2"
  registry_address: "0x3"
planner:
  horizon: 2
  exploration_constant: 1.1
  risk_aversion: 0.2
specialists:
  - name: finance
    class_path: agi_alpha_node.specialists.finance:FinanceStrategist
    capabilities: ["hedging"]
knowledge_lake:
  database_path: knowledge/alpha.db
metrics:
  prometheus_port: 9109
  dashboard_port: 8080
safety:
  enable_automatic_pause: true
  pause_on_failed_ens: false
  pause_on_slash_risk: true
  drill_interval_minutes: 60
""",
        encoding="utf-8",
    )
    (tmp_path / "knowledge").mkdir()
    return config_path


def test_orchestrator_run_cycle(tmp_path: Path, monkeypatch) -> None:
    config_path = _write_config(tmp_path)
    ens_cache = tmp_path / "ens.json"
    ens_cache.write_text("{\"demo.alpha.node.agi.eth\": \"0x0000000000000000000000000000000000000001\"}", encoding="utf-8")

    config = AlphaNodeConfig.load(config_path)
    knowledge = KnowledgeLake(config.resolve_path(config.knowledge_lake.database_path))
    safety = SafetyManager(config.safety)
    stake_client = StakeManagerClient(config.staking)
    orchestrator = Orchestrator(config, knowledge, stake_client, safety)
    orchestrator.load_specialists()

    # Ensure at least one job is available with high capability
    monkeypatch.setattr(orchestrator, "capability_scores", lambda: {"finance": 1.0})
    result = orchestrator.run_cycle()
    assert result.job.domain == "finance"
    assert "finance" in result.specialist_outputs
