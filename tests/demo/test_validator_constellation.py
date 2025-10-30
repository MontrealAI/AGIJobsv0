from __future__ import annotations

import json
from pathlib import Path

import pytest

from demo.validator_constellation_v0.demo_runner import Agent, Demo, DemoState
from demo.validator_constellation_v0.identities import (
    EnsIdentity,
    IdentityError,
    MockEnsRegistry,
    deterministic_registry,
    ensure_agent_identity,
    ensure_node_identity,
    ensure_validator_identity,
)
from demo.validator_constellation_v0.validation import (
    CommitRevealRound,
    DomainPauseController,
    Governance,
    JobResult,
    SentinelMonitor,
    StakeManager,
    SubgraphIndexer,
    VRFCommitteeSelector,
    ValidationRoundConfig,
    ZKBatchAttestor,
    bootstrap_validators,
)


@pytest.fixture
def registry() -> MockEnsRegistry:
    identities = [
        EnsIdentity("0xValidator01", "atlas.club.agi.eth"),
        EnsIdentity("0xValidator02", "nova.club.agi.eth"),
        EnsIdentity("0xValidator03", "zenith.club.agi.eth"),
        EnsIdentity("0xAgent01", "aurora.agent.agi.eth"),
        EnsIdentity("0xAgent02", "pioneer.agent.agi.eth"),
        EnsIdentity("0xNode01", "kepler.node.agi.eth"),
    ]
    return deterministic_registry("validator_constellation_v0", identities)


def test_identity_enforcement(registry: MockEnsRegistry) -> None:
    validator = EnsIdentity("0xValidator01", "atlas.club.agi.eth")
    ensured = ensure_validator_identity(validator, registry)
    assert ensured.address == "0xvalidator01"

    agent = EnsIdentity("0xAgent01", "aurora.agent.agi.eth")
    ensured_agent = ensure_agent_identity(agent, registry)
    assert ensured_agent.name.endswith("agent.agi.eth")

    with pytest.raises(IdentityError):
        ensure_node_identity(EnsIdentity("0xBad", "notallowed.eth"), registry)


def test_commit_reveal_round_succeeds(registry: MockEnsRegistry) -> None:
    validators = bootstrap_validators(
        registry,
        [
            ("0xValidator01", "atlas.club.agi.eth", 1_000),
            ("0xValidator02", "nova.club.agi.eth", 1_000),
            ("0xValidator03", "zenith.club.agi.eth", 1_000),
        ],
    )
    stake_manager = StakeManager(validators)
    selector = VRFCommitteeSelector(seed="demo")
    committee = selector.select(validators, committee_size=3, round_id="round-1")

    config = ValidationRoundConfig(
        quorum=2,
        reveal_deadline_blocks=3,
        penalty_missed_reveal=50,
        penalty_incorrect_vote=25,
        reward_truthful_vote=10,
    )
    round_ctx = CommitRevealRound("round-1", committee, config, stake_manager)

    for validator in committee:
        salt = f"salt-{validator.address}"
        round_ctx.commit_vote(validator, vote=True, salt=salt)
        round_ctx.reveal_vote(validator, vote=True, salt=salt)

    outcome = round_ctx.finalize(truthful_outcome=True)
    assert outcome is True
    assert all(event[0] == "ValidatorRewarded" for event in stake_manager.event_log)


def test_commit_reveal_slashes_misbehaviour(registry: MockEnsRegistry) -> None:
    validators = bootstrap_validators(
        registry,
        [
            ("0xValidator01", "atlas.club.agi.eth", 1_000),
            ("0xValidator02", "nova.club.agi.eth", 1_000),
        ],
    )
    stake_manager = StakeManager(validators)
    config = ValidationRoundConfig(2, 3, 100, 50, 10)
    round_ctx = CommitRevealRound("round-slash", validators, config, stake_manager)

    salt1 = "salt-1"
    round_ctx.commit_vote(validators[0], vote=True, salt=salt1)
    round_ctx.reveal_vote(validators[0], vote=True, salt=salt1)

    salt2 = "salt-2"
    round_ctx.commit_vote(validators[1], vote=True, salt=salt2)
    # Validator 2 never reveals; quorum satisfied by validator 1 + default second vote
    round_ctx.reveals[validators[1].address.lower()] = True

    round_ctx.finalize(truthful_outcome=True)
    slashes = [event for event in stake_manager.event_log if event[0] == "ValidatorSlashed"]
    assert slashes
    assert slashes[0][1]["reason"] == "missed_reveal"


def test_zk_batch_attestor_handles_thousand_jobs() -> None:
    attestor = ZKBatchAttestor(batch_capacity=1_000)
    for index in range(1_000):
        attestor.queue_job(JobResult(job_id=f"job-{index}", payload_hash=str(index), truthful=True))
    digest = attestor.prove_and_submit()
    assert isinstance(digest, str)
    assert attestor.verified_batches


def test_sentinel_triggers_pause() -> None:
    pause_controller = DomainPauseController()
    sentinel = SentinelMonitor(pause_controller)
    alert = sentinel.check_budget("compute", spent=1_200, budget=1_000)
    assert alert is not None
    assert pause_controller.is_paused("compute")

    governance = Governance(pause_controller)
    governance.resume_domain("compute")
    assert not pause_controller.is_paused("compute")


def test_subgraph_indexes_slashes(registry: MockEnsRegistry) -> None:
    validators = bootstrap_validators(
        registry,
        [
            ("0xValidator01", "atlas.club.agi.eth", 1_000),
            ("0xValidator02", "nova.club.agi.eth", 1_000),
        ],
    )
    stake_manager = StakeManager(validators)
    stake_manager.slash(validators[0], 100, "test")

    subgraph = SubgraphIndexer()
    subgraph.ingest(stake_manager.event_log)
    slashes = subgraph.query_slashes()
    assert slashes and slashes[0]["validator"] == "0xvalidator01"


def test_demo_tour_creates_reports(tmp_path: Path) -> None:
    state = DemoState()
    validators = [
        Agent(address="0xValidator01", ens="atlas.club.agi.eth", domain="compute", budget=0),
        Agent(address="0xValidator02", ens="nova.club.agi.eth", domain="compute", budget=0),
        Agent(address="0xValidator03", ens="zenith.club.agi.eth", domain="compute", budget=0),
    ]
    nodes = [Agent(address="0xNode01", ens="kepler.node.agi.eth", domain="compute", budget=0)]
    agents = [
        Agent(address="0xAgent01", ens="aurora.agent.agi.eth", domain="compute", budget=1_000),
        Agent(address="0xAgent02", ens="pioneer.agent.agi.eth", domain="safety-lab", budget=500),
    ]
    state.initialise_registry(validators, nodes, agents)
    demo = Demo(state)

    stake_manager = demo.onboard_validators(
        [(agent.address, agent.ens, 1_000) for agent in validators]
    )
    demo.onboard_agents(agents)
    committee_info = demo.run_validation_round(
        stake_manager=stake_manager,
        committee_size=3,
        truthful_outcome=True,
        round_id="alpha",
    )
    digest = demo.demonstrate_batch_attestation(1_000)
    alert = demo.trigger_budget_overrun(agents[0], overrun=200)
    demo.governance_resume(agents[0].domain)

    report_path = tmp_path / "report.json"
    demo.export_report(report_path, {
        "committee": committee_info,
        "proof_digest": digest,
        "alert": alert,
    })

    data = json.loads(report_path.read_text())
    assert data["committee"]["round"] == "alpha"
    assert data["alert"]["paused"]
