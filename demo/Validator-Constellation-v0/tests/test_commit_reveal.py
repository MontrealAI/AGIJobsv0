from __future__ import annotations

from decimal import Decimal

import pytest

from validator_constellation.commit_reveal import CommitRevealRound
from validator_constellation.config import SystemConfig
from validator_constellation.events import EventBus
from validator_constellation.identity import ENSIdentityVerifier
from validator_constellation.staking import StakeManager


@pytest.fixture()
def setup_environment():
    config = SystemConfig()
    bus = EventBus()
    stake_manager = StakeManager(bus, config.owner_address)
    identity = ENSIdentityVerifier(
        config.allowed_validator_roots,
        config.allowed_agent_roots,
        config.allowed_node_roots,
        blacklist=config.blacklist,
    )
    validators = {
        "0x1": "atlas.club.agi.eth",
        "0x2": "zephyr.club.agi.eth",
        "0x3": "nova.club.agi.eth",
    }
    for address, ens in validators.items():
        proof = identity.sign(ens, address)
        identity.verify_validator(address, proof)
        stake_manager.register_validator(address, ens, Decimal("32"))
    return config, bus, stake_manager, validators


def test_commit_reveal_success(setup_environment):
    config, bus, stake_manager, validators = setup_environment
    committee = validators
    round_engine = CommitRevealRound(
        round_id="test-round",
        committee=committee,
        config=config,
        stake_manager=stake_manager,
        event_bus=bus,
        truthful_outcome=True,
    )
    salts = {address: f"salt::{i}" for i, address in enumerate(committee, start=1)}
    for address in committee:
        round_engine.commit(address, True, salts[address])
    for address in committee:
        round_engine.reveal(address, True, salts[address])
    outcome = round_engine.finalize()
    assert outcome is True
    slashed = list(bus.find("ValidatorSlashed"))
    assert not slashed


def test_slashes_non_reveal(setup_environment):
    config, bus, stake_manager, validators = setup_environment
    committee = validators
    round_engine = CommitRevealRound(
        round_id="test-round",
        committee=committee,
        config=config,
        stake_manager=stake_manager,
        event_bus=bus,
        truthful_outcome=True,
    )
    salts = {address: f"salt::{i}" for i, address in enumerate(committee, start=1)}
    for address in committee:
        round_engine.commit(address, True, salts[address])
    for address in list(committee.keys())[:-1]:
        round_engine.reveal(address, True, salts[address])
    with pytest.raises(RuntimeError):
        round_engine.finalize()
    round_engine.advance_blocks(config.reveal_phase_blocks)
    round_engine.finalize()
    slashed = [event.payload["address"] for event in bus.find("ValidatorSlashed")]
    assert len(slashed) == 1
    assert list(committee.keys())[-1] in slashed


def test_slashes_incorrect_vote(setup_environment):
    config, bus, stake_manager, validators = setup_environment
    committee = validators
    round_engine = CommitRevealRound(
        round_id="test-round",
        committee=committee,
        config=config,
        stake_manager=stake_manager,
        event_bus=bus,
        truthful_outcome=True,
    )
    salts = {address: f"salt::{i}" for i, address in enumerate(committee, start=1)}
    for address in committee:
        vote = address != "0x1"
        round_engine.commit(address, vote, salts[address])
    # Validator 0x1 reveals false, others reveal true
    round_engine.reveal("0x1", False, salts["0x1"])
    for address in list(committee.keys())[1:]:
        round_engine.reveal(address, True, salts[address])
    round_engine.finalize()
    slashed = [event.payload["address"] for event in bus.find("ValidatorSlashed")]
    assert "0x1" in slashed


def test_commit_reveal_deadlines_enforced(setup_environment):
    config, bus, stake_manager, validators = setup_environment
    config.commit_phase_blocks = 2
    config.reveal_phase_blocks = 2
    config.quorum = 1
    committee = {key: validators[key] for key in list(validators.keys())[:2]}
    round_engine = CommitRevealRound(
        round_id="deadline-round",
        committee=committee,
        config=config,
        stake_manager=stake_manager,
        event_bus=bus,
        truthful_outcome=True,
    )
    salts = {address: f"salt::{i}" for i, address in enumerate(committee, start=1)}
    addresses = list(committee.keys())
    first, second = addresses[0], addresses[1]
    round_engine.commit(first, True, salts[first])
    round_engine.advance_blocks(config.commit_phase_blocks)
    with pytest.raises(RuntimeError):
        round_engine.commit(second, True, salts[second])
    # Reveal is only allowed after the commit window closed
    round_engine.reveal(first, True, salts[first])
    round_engine.advance_blocks(config.reveal_phase_blocks)
    result = round_engine.finalize()
    assert result is True
    timeline_event = next(bus.find("RoundFinalized"))
    timeline = timeline_event.payload["timeline"]
    assert timeline["commitDeadlineBlock"] == config.commit_phase_blocks
    assert timeline["revealDeadlineBlock"] == config.commit_phase_blocks + config.reveal_phase_blocks
