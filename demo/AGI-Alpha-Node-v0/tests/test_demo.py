import json
import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

ROOT = Path(__file__).resolve().parents[1]
src_path = ROOT / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from agi_alpha_node_demo.blockchain.contracts import JobRegistryClient, MockLedger, StakeManagerClient, SystemPauseClient
from agi_alpha_node_demo.blockchain.ens import ENSVerifier
from agi_alpha_node_demo.compliance.scorecard import ComplianceEngine
from agi_alpha_node_demo.config import load_config
from agi_alpha_node_demo.governance import GovernanceController
from agi_alpha_node_demo.knowledge.lake import KnowledgeLake
from agi_alpha_node_demo.metrics.exporter import MetricRegistry
from agi_alpha_node_demo.orchestrator import Orchestrator
from agi_alpha_node_demo.planner.muzero import MuZeroPlanner
from agi_alpha_node_demo.safety.pause import PauseController
from agi_alpha_node_demo.tasks.router import TaskHarvester

CONFIG_PATH = ROOT / "config" / "default.toml"


@pytest.fixture()
def components(tmp_path):
    config = load_config(CONFIG_PATH)
    ledger = MockLedger()
    stake_manager = StakeManagerClient(ledger)
    pause_client = SystemPauseClient(ledger)
    ens = ENSVerifier("http://localhost", 1)
    knowledge = KnowledgeLake(tmp_path / "knowledge.db")
    planner = MuZeroPlanner(2, 8, 1.2)
    registry = JobRegistryClient()
    harvester = TaskHarvester(registry)
    orchestrator = Orchestrator(planner, knowledge, harvester)
    metrics = MetricRegistry()
    pause_controller = PauseController(pause_client)
    governance = GovernanceController(config.governance, pause_controller, metrics)
    compliance = ComplianceEngine(config, ens, stake_manager, pause_client)
    return {
        "config": config,
        "ledger": ledger,
        "stake_manager": stake_manager,
        "pause_client": pause_client,
        "ens": ens,
        "knowledge": knowledge,
        "planner": planner,
        "registry": registry,
        "harvester": harvester,
        "orchestrator": orchestrator,
        "metrics": metrics,
        "pause_controller": pause_controller,
        "governance": governance,
        "compliance": compliance,
    }


def test_compliance_report_serializable(tmp_path, components):
    config = components["config"]
    stake_manager: StakeManagerClient = components["stake_manager"]
    stake_manager.deposit(config.governance.owner_address, config.staking.required_stake)
    report = components["compliance"].evaluate()
    encoded = json.dumps(report.to_dict())
    assert "overall_score" in encoded


def test_orchestrator_generates_rewards(components):
    registry: JobRegistryClient = components["registry"]
    orchestrator: Orchestrator = components["orchestrator"]

    registry.register_job(
        "unit-job",
        {"domain": "finance", "capital": "1000", "risk": "0.2", "reward": "10"},
    )
    reports = orchestrator.run_cycle()
    assert reports
    assert reports[0].total_reward > 0


def test_pause_controller_blocks_when_paused(components):
    pause_controller = components["pause_controller"]
    pause_controller.pause()
    triggered = {"value": False}

    def critical_section():
        triggered["value"] = True

    executed = pause_controller.guard(critical_section)
    assert executed is False
    assert not triggered["value"]
