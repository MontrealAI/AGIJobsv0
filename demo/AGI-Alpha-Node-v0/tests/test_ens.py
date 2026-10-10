import hashlib
import os
import sys
from pathlib import Path

os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

ROOT = Path(__file__).resolve().parents[1]
src_path = ROOT / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from agi_alpha_node_demo.blockchain.ens import ENSVerifier


def test_offline_ens_verification_uses_deterministic_hash():
    ens = ENSVerifier("", 1)
    ens._web3 = None
    domain = "example.eth"
    expected_owner = "0x" + hashlib.sha256(domain.encode("utf-8")).hexdigest()[:40]

    result = ens.verify(domain, expected_owner)
    assert result.actual_owner == expected_owner
    assert result.verified is True

    repeat = ens.verify(domain, expected_owner)
    assert repeat.actual_owner == expected_owner
