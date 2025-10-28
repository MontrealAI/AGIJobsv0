from __future__ import annotations

from decimal import Decimal

from validator_constellation.config import SystemConfig
from validator_constellation.events import EventBus
from validator_constellation.identity import ENSIdentityVerifier
from validator_constellation.staking import StakeManager
from validator_constellation.vrf import VRFCoordinator


def test_vrf_committee_deterministic():
    config = SystemConfig()
    bus = EventBus()
    stake_manager = StakeManager(bus, config.owner_address)
    identity = ENSIdentityVerifier(
        config.allowed_validator_roots,
        config.allowed_agent_roots,
        config.allowed_node_roots,
    )
    validators = {
        "0x1": "atlas.club.agi.eth",
        "0x2": "zephyr.club.agi.eth",
        "0x3": "nova.club.agi.eth",
        "0x4": "orion.club.agi.eth",
    }
    for address, ens in validators.items():
        proof = identity.sign(ens, address)
        identity.verify_validator(address, proof)
        stake_manager.register_validator(address, ens, Decimal("32"))
    vrf = VRFCoordinator(stake_manager, domain="test")
    committee_one = vrf.select_committee("seed", 3)
    committee_two = vrf.select_committee("seed", 3)
    assert committee_one == committee_two
    assert len(set(committee_one)) == 3
