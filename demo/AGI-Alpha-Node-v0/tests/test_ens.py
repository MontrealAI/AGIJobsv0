from pathlib import Path

from alpha_node.config import ENSSettings
from alpha_node.ens import ENSVerifier


def test_suffix_enforced(tmp_path: Path) -> None:
    registry = tmp_path / "ens.csv"
    registry.write_text("demo.alpha.node.agi.eth,0xabc\n")
    settings = ENSSettings(
        domain="rogue.alpha.agent.agi.eth",
        owner_address="0xabc",
        required_suffix=".alpha.node.agi.eth",
    )
    verifier = ENSVerifier(settings, registry)
    result = verifier.verify()
    assert result.verified is False
    assert result.source == "suffix-mismatch"


def test_offline_registry_success(tmp_path: Path) -> None:
    registry = tmp_path / "ens.csv"
    registry.write_text("demo.alpha.node.agi.eth,0xabc\n")
    settings = ENSSettings(
        domain="demo.alpha.node.agi.eth",
        owner_address="0xabc",
        required_suffix=".alpha.node.agi.eth",
    )
    verifier = ENSVerifier(settings, registry)
    result = verifier.verify()
    assert result.verified is True
    assert result.source == "offline"
