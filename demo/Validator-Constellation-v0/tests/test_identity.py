from __future__ import annotations

import pytest

from validator_constellation.config import SystemConfig
from validator_constellation.identity import ENSIdentityVerifier


def test_validator_namespaces():
    config = SystemConfig()
    verifier = ENSIdentityVerifier(
        config.allowed_validator_roots,
        config.allowed_agent_roots,
        config.allowed_node_roots,
        blacklist=config.blacklist,
    )
    proof = verifier.sign("atlas.club.agi.eth", "0xabc")
    verifier.verify_validator("0xAbC", proof)


def test_rejects_invalid_namespace():
    config = SystemConfig()
    verifier = ENSIdentityVerifier(
        config.allowed_validator_roots,
        config.allowed_agent_roots,
        config.allowed_node_roots,
    )
    proof = verifier.sign("eve.hacker.eth", "0xabc")
    with pytest.raises(PermissionError):
        verifier.verify_validator("0xabc", proof)


def test_blacklist_enforced():
    config = SystemConfig.with_overrides([("blacklist", ("0xabc",))])
    verifier = ENSIdentityVerifier(
        config.allowed_validator_roots,
        config.allowed_agent_roots,
        config.allowed_node_roots,
        blacklist=config.blacklist,
    )
    proof = verifier.sign("atlas.club.agi.eth", "0xabc")
    with pytest.raises(PermissionError):
        verifier.verify_validator("0xabc", proof)
