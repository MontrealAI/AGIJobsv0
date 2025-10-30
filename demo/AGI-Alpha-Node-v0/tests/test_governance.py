import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src_path = ROOT / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from agi_alpha_node_demo.config import GovernanceConfig
from agi_alpha_node_demo.governance import GovernanceController
from agi_alpha_node_demo.metrics.exporter import MetricRegistry
from agi_alpha_node_demo.safety.pause import PauseController
from agi_alpha_node_demo.blockchain.contracts import SystemPauseClient


def test_governance_updates_track_metrics():
    pause_client = SystemPauseClient()
    pause_controller = PauseController(pause_client)
    metrics = MetricRegistry()
    config = GovernanceConfig(
        owner_address="0x0000000000000000000000000000000000000001",
        governance_address="0x0000000000000000000000000000000000000002",
    )
    controller = GovernanceController(config, pause_controller, metrics)
    state = controller.update_owner("0x00000000000000000000000000000000000000AA", config.owner_address)
    controller.update_governance("0x00000000000000000000000000000000000000BB", state.owner_address)
    controller.pause_all(state.owner_address)
    controller.resume_all(state.owner_address)

    state = controller.snapshot()
    assert state.owner_address.endswith("AA")
    assert state.governance_address.endswith("BB")
    metrics_snapshot = metrics.snapshot()
    assert metrics_snapshot["agi_alpha_node_governance_events_total"] >= 4.0
    assert metrics_snapshot["agi_alpha_node_governance_paused"] == 0.0
