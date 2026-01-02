"""Integration-style tests for the AGI Alpha Node demo."""
from __future__ import annotations

import json
import pathlib
import sys

import pytest

PACKAGE_ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE_ROOT_STR = str(PACKAGE_ROOT)
if PACKAGE_ROOT_STR not in sys.path:
    sys.path.insert(0, PACKAGE_ROOT_STR)


def _ensure_grand_demo_alpha_node() -> None:
    module = sys.modules.get("alpha_node")
    if not module:
        return

    module_file = getattr(module, "__file__", "") or ""
    module_paths = [str(path) for path in getattr(module, "__path__", [])]
    if PACKAGE_ROOT_STR in module_file or any(PACKAGE_ROOT_STR in path for path in module_paths):
        return

    for name in list(sys.modules):
        if name == "alpha_node" or name.startswith("alpha_node."):
            sys.modules.pop(name, None)


_ensure_grand_demo_alpha_node()

from alpha_node.ai.planner import MuZeroPlanner
from alpha_node.compliance.scorecard import ComplianceEngine
from alpha_node.config import AlphaNodeConfig
from alpha_node.knowledge.lake import KnowledgeLake


@pytest.fixture()
def config_dict(tmp_path: pathlib.Path) -> dict:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
        governance:
          governance_address: "0x0000000000000000000000000000000000000001"
          emergency_pause_address: "0x0000000000000000000000000000000000000002"
          ens_domain: "demo.alpha.node.agi.eth"
        blockchain:
          rpc_url: "http://localhost:8545"
          chain_id: 1337
          contracts:
            stake_manager:
              name: "StakeManager"
              address: "0x0000000000000000000000000000000000000003"
              abi: "abis/StakeManager.json"
        planner:
          horizon: 4
          exploration_constant: 1.2
          discount_factor: 0.95
          max_rollouts: 32
          temperature: 1.0
        specialists:
          - name: "finance"
        knowledge_lake:
          path: "storage/knowledge/test.json"
          embedding_dim: 8
          similarity_threshold: 0.3
        metrics:
          host: "0.0.0.0"
          port: 9999
        web:
          host: "0.0.0.0"
          port: 8080
          enable_https: false
          allowed_origins:
            - "*"
        compliance:
          drill_interval_minutes: 5
          minimum_stake: 100
        """
    )
    return json.loads(json.dumps(AlphaNodeConfig.from_file(config_path).__dict__, default=str))


def test_planner_generates_consistent_actions():
    planner = MuZeroPlanner(horizon=3, exploration_constant=1.4, discount_factor=0.97, max_rollouts=32)
    result = planner.plan("root", {"finance": 0.5, "biotech": 0.3, "manufacturing": 0.2}, lambda state: 0.8)
    assert result.action in {"finance", "biotech", "manufacturing"}
    assert 0 <= result.confidence <= 1


def test_knowledge_lake_persistence(tmp_path: pathlib.Path):
    path = tmp_path / "knowledge.json"
    lake = KnowledgeLake(path=path, embedding_dim=4, similarity_threshold=0.1)
    lake.upsert("alpha", [1, 0, 0, 0], {"summary": "test"})
    matches = lake.query([1, 0, 0, 0])
    assert matches and matches[0][0].payload["summary"] == "test"


def test_compliance_engine_scoring():
    engine = ComplianceEngine()
    score = engine.build_score(
        ens_verified=True,
        stake_ok=True,
        paused=False,
        rewards_growth=0.9,
        drills_ok=True,
        planner_confidence=0.88,
    )
    assert score.aggregate() >= 0.8
