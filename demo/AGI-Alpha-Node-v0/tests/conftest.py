import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest

from alpha_node.state import NodeState, StateStore


@pytest.fixture()
def demo_workspace(tmp_path: Path) -> Path:
    destination = tmp_path / "AGI-Alpha-Node-v0"
    shutil.copytree(ROOT, destination)
    state_path = destination / "state.json"
    store = StateStore(state_path)
    store.write(NodeState())
    ledger = destination / "stake_ledger.csv"
    ledger.write_text("event,amount,total_locked,timestamp\n")
    return destination
