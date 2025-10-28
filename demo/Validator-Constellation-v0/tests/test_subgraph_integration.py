from __future__ import annotations

from decimal import Decimal

from validator_constellation.config import SystemConfig
from validator_constellation.events import EventBus
from validator_constellation.identity import ENSIdentityVerifier
from validator_constellation.staking import StakeManager
from validator_constellation.subgraph import SubgraphIndexer


def test_subgraph_indexes_slashing_events():
    config = SystemConfig()
    bus = EventBus()
    indexer = SubgraphIndexer(bus)
    stake_manager = StakeManager(bus, config.owner_address)
    identity = ENSIdentityVerifier(
        config.allowed_validator_roots,
        config.allowed_agent_roots,
        config.allowed_node_roots,
    )
    proof = identity.sign("atlas.club.agi.eth", "0xabc")
    identity.verify_validator("0xabc", proof)
    stake_manager.register_validator("0xabc", "atlas.club.agi.eth", Decimal("32"))
    stake_manager.slash("0xabc", 0.25, reason="misbehaviour")
    latest = indexer.latest("ValidatorSlashed")
    assert latest is not None
    assert latest.payload["reason"] == "misbehaviour"
