from pathlib import Path

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "agi_alpha_node"))

from agi_alpha_node.config import DEFAULT_CONFIG_PATH, load_config


def test_load_config_defaults(tmp_path):
    cfg = load_config()
    assert cfg.ens_name == "demo.alpha.node.agi.eth"
    assert cfg.blockchain.rpc_url.startswith("https://")
    assert DEFAULT_CONFIG_PATH.exists()

    override = tmp_path / "override.yaml"
    override.write_text("ens_name: custom.alpha.node.agi.eth\nminimum_stake: 42\n")
    cfg2 = load_config(str(override), overrides={"operator_address": "0xabc"})
    assert cfg2.ens_name == "custom.alpha.node.agi.eth"
    assert cfg2.minimum_stake == 42
    assert cfg2.operator_address == "0xabc"
