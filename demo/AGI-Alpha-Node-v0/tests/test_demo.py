from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from agi_alpha_node_demo.blockchain.contracts import JobRegistryClient, MockLedger, StakeManagerClient, SystemPauseClient  # noqa: E402
from agi_alpha_node_demo.blockchain.ens import ENSVerifier  # noqa: E402
from agi_alpha_node_demo.compliance.scorecard import ComplianceEngine  # noqa: E402
from agi_alpha_node_demo.config import load_config  # noqa: E402
from agi_alpha_node_demo.knowledge.lake import KnowledgeLake  # noqa: E402
from agi_alpha_node_demo.orchestrator import Orchestrator  # noqa: E402
from agi_alpha_node_demo.planner.muzero import MuZeroPlanner  # noqa: E402
from agi_alpha_node_demo.safety.pause import PauseController  # noqa: E402
from agi_alpha_node_demo.tasks.router import TaskHarvester  # noqa: E402

CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "default.toml"


def build_components():
    config = load_config(CONFIG_PATH)
    ledger = MockLedger()
    stake_manager = StakeManagerClient(ledger)
    pause_client = SystemPauseClient(ledger)
    ens = ENSVerifier("http://localhost", 1)
    knowledge = KnowledgeLake(
        Path("/tmp/agi_alpha_node_test.db")
    )
    planner = MuZeroPlanner(2, 8, 1.2)
    registry = JobRegistryClient()
    harvester = TaskHarvester(registry)
    orchestrator = Orchestrator(planner, knowledge, harvester)
    compliance = ComplianceEngine(config, ens, stake_manager, pause_client)
    return config, {
        "ledger": ledger,
        "stake_manager": stake_manager,
        "pause": pause_client,
        "ens": ens,
        "knowledge": knowledge,
        "planner": planner,
        "registry": registry,
        "harvester": harvester,
        "orchestrator": orchestrator,
        "compliance": compliance,
    }


def test_compliance_report_serializable(tmp_path):
    config, components = build_components()
    stake_manager: StakeManagerClient = components["stake_manager"]
    stake_manager.deposit(config.governance.owner_address, config.staking.required_stake)
    report = components["compliance"].evaluate()
    encoded = json.dumps(report.to_dict())
    assert "overall_score" in encoded


def test_orchestrator_generates_rewards(tmp_path):
    config, components = build_components()
    registry: JobRegistryClient = components["registry"]
    orchestrator: Orchestrator = components["orchestrator"]

    registry.register_job(
        "unit-job",
        {"domain": "finance", "capital": "1000", "risk": "0.2", "reward": "10"},
    )
    reports = orchestrator.run_cycle()
    assert reports
    assert reports[0].total_reward > 0


def test_pause_controller_blocks_when_paused(tmp_path):
    _, components = build_components()
    pause_controller = PauseController(components["pause"])
    pause_controller.pause()
    triggered = {"value": False}

    def critical_section():
        triggered["value"] = True

    pause_controller.guard(critical_section)
    assert not triggered["value"]
