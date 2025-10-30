from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "validator_constellation.py"
SPEC = importlib.util.spec_from_file_location("validator_constellation_demo_module", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules["validator_constellation_demo_module"] = MODULE
SPEC.loader.exec_module(MODULE)  # type: ignore[arg-type]

Agent = MODULE.Agent
DemoOrchestrator = MODULE.DemoOrchestrator
ENSVerifier = MODULE.ENSVerifier
JobResult = MODULE.JobResult
Node = MODULE.Node
Validator = MODULE.Validator


def _bootstrap_orchestrator() -> DemoOrchestrator:
    registry = ENSVerifier(
        {
            "atlas.club.agi.eth": "0xA7",
            "callisto.club.agi.eth": "0xC1",
            "selene.club.agi.eth": "0xS1",
            "vega.club.agi.eth": "0xV1",
            "atlas.agent.agi.eth": "0xa9",
            "selene.agent.agi.eth": "0xb0",
            "atlas.node.agi.eth": "0xc9",
        }
    )
    orchestrator = DemoOrchestrator(
        owner_address="0xA7",
        validators=[
            Validator("0xA7", "atlas.club.agi.eth", stake=1_000),
            Validator("0xC1", "callisto.club.agi.eth", stake=1_000),
            Validator("0xS1", "selene.club.agi.eth", stake=1_000),
            Validator("0xV1", "vega.club.agi.eth", stake=1_000),
        ],
        agents=[
            Agent("0xa9", "atlas.agent.agi.eth", budget=250),
            Agent("0xb0", "selene.agent.agi.eth", budget=250),
        ],
        nodes=[Node("0xc9", "atlas.node.agi.eth")],
        ens_registry=registry,
        epoch_seed="pytest-epoch",
    )
    return orchestrator


def test_owner_controls_apply_and_emit_events():
    orchestrator = _bootstrap_orchestrator()
    orchestrator.update_minimum_stake(250)
    orchestrator.update_sentinel_limit(1_500)
    orchestrator.update_committee_parameters(committee_size=3, quorum=2)
    orchestrator.update_validator_stake("0xA7", "atlas.club.agi.eth", 2_000)
    orchestrator.pause_domain("bio-vault", "test-window")
    orchestrator.resume_domain("bio-vault")
    orchestrator.rotate_epoch_seed("pytest-epoch-2")

    assert orchestrator.ledger.min_stake == 250
    assert orchestrator.sentinal.budget_limit_per_agent == 1_500
    assert orchestrator.committee_size == 3
    assert orchestrator.quorum == 2
    assert orchestrator.pause_manager.is_paused("bio-vault") is False
    assert orchestrator.ledger.get_stake("0xA7") == 2_000
    assert orchestrator.owner_actions

    event_types = [event.type for event in orchestrator.subgraph.events]
    assert "MinimumStakeUpdated" in event_types
    assert "SentinelBudgetUpdated" in event_types
    assert "CommitteeParametersUpdated" in event_types
    assert "OwnerAction" in event_types

    jobs = [
        JobResult(job_id=f"job::{i}", commitment="deadbeef", output_hash="cafe")
        for i in range(4)
    ]
    proof = orchestrator.produce_zk_attestation(jobs)
    assert proof["calldata"]["jobCount"] == len(jobs)
    assert proof["calldata"]["digest"] == proof["digest"]
    assert proof["calldata"]["validationSignature"]
