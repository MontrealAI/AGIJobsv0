from pathlib import Path

from alpha_node.config import AlphaNodeConfig
from alpha_node.node import AlphaNode


def _write_config(tmp_path: Path) -> Path:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
identity:
  ens_domain: demo.alpha.node.agi.eth
  owner_address: "0x1234567890abcdef1234567890abcdef12345678"

governance:
  governance_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"

economy:
  stake_threshold: 1

network:
  rpc_url: ""

contracts:
  job_registry: "0x1"
  stake_manager: "0x2"
  incentives: "0x3"
  treasury: "0x4"

storage:
  knowledge_lake: "storage/knowledge.json"
  log_file: "logs/alpha.log"

observability:
  enable_prometheus: false
  enable_dashboard: false

specialists:
  - name: finance
    model: "demo"
    risk_limit: 1.0
    description: "Demo finance"
    enabled: true
""",
        encoding="utf-8",
    )
    (tmp_path / "storage").mkdir()
    (tmp_path / "logs").mkdir()
    return config_path


def test_alpha_node_run_once(tmp_path: Path) -> None:
    config_path = _write_config(tmp_path)
    ens_cache = tmp_path / "ens.json"
    ens_cache.write_text("{\"demo.alpha.node.agi.eth\": \"0x1234567890abcdef1234567890abcdef12345678\"}", encoding="utf-8")
    config = AlphaNodeConfig.load(config_path)
    node = AlphaNode(config=config, ens_cache=ens_cache)
    node.bootstrap()
    result = node.run_once()
    assert result is not None
    assert node.state.ops.completed_jobs >= 1
