"""Executable scenario for the Validator Constellation demo.

A non-technical operator can run this module with ``python demo_runner.py`` to
observe how AGI Jobs v0 (v2) assembles a validator constellation, executes
commit–reveal governance, produces a batched ZK attestation covering one
thousand jobs, and automatically freezes unsafe domains when the Sentinel
triggers.
"""
from __future__ import annotations

import argparse
import importlib.util
import secrets
import sys
from pathlib import Path
from typing import Dict, List

MODULE_ROOT = Path(__file__).resolve().parent
MODULE_NAME = "validator_constellation_runtime"

if MODULE_NAME in sys.modules:
    validator_module = sys.modules[MODULE_NAME]
else:
    spec = importlib.util.spec_from_file_location(
        MODULE_NAME, MODULE_ROOT / "validator_constellation.py"
    )
    validator_module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[MODULE_NAME] = validator_module
    spec.loader.exec_module(validator_module)  # type: ignore[assignment]

Agent = validator_module.Agent
AgentAction = validator_module.AgentAction
DemoOrchestrator = validator_module.DemoOrchestrator
ENSVerifier = validator_module.ENSVerifier
JobResult = validator_module.JobResult
Node = validator_module.Node
SentinelAlert = validator_module.SentinelAlert
Validator = validator_module.Validator


def _bootstrap_identities() -> Dict[str, str]:
    """Creates a deterministic ENS registry for the demo."""
    return {
        "atlas.club.agi.eth": "0xA7",
        "callisto.club.agi.eth": "0xC1",
        "hyperion.club.agi.eth": "0xH1",
        "selene.club.agi.eth": "0xS1",
        "vega.club.agi.eth": "0xV1",
        "atlas.agent.agi.eth": "0xa9",
        "selene.agent.agi.eth": "0xb0",
        "io.agent.agi.eth": "0xb1",
        "atlas.node.agi.eth": "0xc9",
        "selene.node.agi.eth": "0xd1",
    }


def _create_validators(registry: ENSVerifier) -> List[Validator]:
    validators = [
        Validator("0xA7", "atlas.club.agi.eth", stake=1_000_000),
        Validator("0xC1", "callisto.club.agi.eth", stake=1_200_000),
        Validator("0xH1", "hyperion.club.agi.eth", stake=950_000),
        Validator("0xS1", "selene.club.agi.eth", stake=1_100_000),
        Validator("0xV1", "vega.club.agi.eth", stake=900_000),
    ]
    for validator in validators:
        registry.verify_validator(validator.ens, validator.address)
    return validators


def _create_agents(registry: ENSVerifier) -> List[Agent]:
    agents = [
        Agent("0xa9", "atlas.agent.agi.eth", budget=500),
        Agent("0xb0", "selene.agent.agi.eth", budget=500),
        Agent("0xb1", "io.agent.agi.eth", budget=500),
    ]
    for agent in agents:
        registry.verify_agent(agent.ens, agent.address)
    return agents


def _create_nodes(registry: ENSVerifier) -> List[Node]:
    nodes = [
        Node("0xc9", "atlas.node.agi.eth"),
        Node("0xd1", "selene.node.agi.eth"),
    ]
    for node in nodes:
        registry.verify_node(node.ens, node.address)
    return nodes


def _prepare_jobs(batch_size: int) -> List[JobResult]:
    jobs: List[JobResult] = []
    for idx in range(batch_size):
        job_id = f"job-{idx:04d}"
        commitment = secrets.token_hex(16)
        output_hash = secrets.token_hex(32)
        jobs.append(JobResult(job_id, commitment, output_hash))
    return jobs


def run_demo(batch_size: int) -> Dict[str, object]:
    registry = ENSVerifier(_bootstrap_identities())
    validators = _create_validators(registry)
    agents = _create_agents(registry)
    nodes = _create_nodes(registry)
    orchestrator = DemoOrchestrator(
        owner_address="0xOWNER",
        validators=validators,
        agents=agents,
        nodes=nodes,
        ens_registry=registry,
        epoch_seed="validator-constellation-epoch-0",
    )
    commit_round = orchestrator.run_commit_reveal_round(truthful_outcome="approve")
    jobs = _prepare_jobs(batch_size)
    zk_proof = orchestrator.produce_zk_attestation(jobs)
    sentinel_alert: SentinelAlert | None = orchestrator.simulate_action(
        AgentAction(
            agent=agents[0],
            domain="orion-labor",
            spend=1_000,
            description="Detected unsafe financial leverage request",
        )
    )
    output = {
        "committee": [validator.ens for validator in commit_round.committee],
        "zk_proof": zk_proof,
        "sentinel_alert": sentinel_alert,
        "domain_paused": orchestrator.pause_manager.is_paused("orion-labor"),
        "events": [
            {
                "type": event.type,
                "payload": event.payload,
            }
            for event in orchestrator.subgraph.events
        ],
    }
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Validator Constellation demo scenario")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1_000,
        help="Number of jobs to aggregate inside the ZK batch attestation",
    )
    args = parser.parse_args()
    results = run_demo(args.batch_size)
    print("\n=== Validator Constellation Demo Summary ===")
    print("Committee:")
    for ens in results["committee"]:
        print(f"  • {ens}")
    print("\nZero-knowledge attestation:")
    print(f"  Jobs attested: {results['zk_proof']['size']}")
    print(f"  Digest: {results['zk_proof']['digest']}")
    print(f"  Proof: {results['zk_proof']['proof'][:32]}…")
    if results["sentinel_alert"]:
        print("\nSentinel alert triggered:")
        print(f"  Domain: {results['sentinel_alert'].domain}")
        print(f"  Agent: {results['sentinel_alert'].agent_ens}")
        print(f"  Reason: {results['sentinel_alert'].reason}")
    else:
        print("\nNo sentinel alerts detected.")
    print("\nDomain pause status:")
    print(f"  orion-labor paused: {results['domain_paused']}")
    print("\nEvents emitted (first 8):")
    for event in results["events"][:8]:
        print(f"  - {event['type']}: {event['payload']}")
    print("\nUse the --batch-size flag to experiment with different throughput targets.")


if __name__ == "__main__":
    main()
