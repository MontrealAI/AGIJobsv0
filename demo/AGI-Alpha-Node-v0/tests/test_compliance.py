import os
import sys
from pathlib import Path

os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

ROOT = Path(__file__).resolve().parents[1]
src_path = ROOT / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from agi_alpha_node_demo.blockchain.contracts import MockLedger, StakeManagerClient, SystemPauseClient
from agi_alpha_node_demo.blockchain.ens import ENSVerificationResult, ENSVerifier
from agi_alpha_node_demo.compliance.scorecard import ComplianceEngine
from agi_alpha_node_demo.config import load_config

CONFIG_PATH = ROOT / "config" / "default.toml"


class OfflineENS(ENSVerifier):
    def __init__(self) -> None:
        super().__init__("http://localhost", 1)

    def verify(self, domain: str, expected_owner: str) -> ENSVerificationResult:  # type: ignore[override]
        return ENSVerificationResult(domain, expected_owner, expected_owner, True)


def test_compliance_scores_all_dimensions(tmp_path):
    config = load_config(CONFIG_PATH)
    ledger = MockLedger()
    stake_manager = StakeManagerClient(ledger)
    pause_client = SystemPauseClient(ledger)
    ens = OfflineENS()
    stake_manager.deposit(config.governance.owner_address, config.staking.required_stake)
    engine = ComplianceEngine(config, ens, stake_manager, pause_client)
    report = engine.evaluate()
    assert report.overall_score > 0.5
    assert set(report.dimensions.keys()) == {
        "identity",
        "staking",
        "governance",
        "economy",
        "antifragility",
        "intelligence",
    }
