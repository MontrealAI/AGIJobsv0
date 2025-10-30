"""Console tour for the Validator Constellation demo."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

from .demo_runner import Agent, Demo, DemoState
from .identities import EnsIdentity

REPORT_PATH = Path("reports/validator-constellation-report.json")
EVENTS_PATH = Path("reports/validator-constellation-events.json")


def _prepare_directories() -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)


def _print_header() -> None:
    print("\n🚀 Launching Validator Constellation Demo\n")


def _display_committee_info(info: Dict[str, str]) -> None:
    print(f"Round {info['round']} committed with committee: {', '.join(info['committee'])}")
    print(f"Truthful outcome agreed: {info['truthful_outcome']}")


def _display_proof_digest(digest: str) -> None:
    print(f"Aggregated proof digest: {digest}")


def _display_alert(alert: Dict[str, str]) -> None:
    print(f"Sentinel triggered for domain {alert['domain']}: {alert['alert']}")
    print(f"Domain paused? {alert['paused']}")


def _display_resume(domain: str) -> None:
    print(f"Governance resumed domain {domain}. Operations restored.")


def main() -> None:
    _prepare_directories()
    _print_header()

    state = DemoState()

    validator_agents = [
        Agent(address="0xValidator01", ens="atlas.club.agi.eth", domain="compute", budget=0),
        Agent(address="0xValidator02", ens="nova.club.agi.eth", domain="compute", budget=0),
        Agent(address="0xValidator03", ens="zenith.club.agi.eth", domain="compute", budget=0),
    ]

    node_agents = [
        Agent(address="0xNode01", ens="kepler.node.agi.eth", domain="compute", budget=0),
    ]

    worker_agents = [
        Agent(address="0xAgent01", ens="aurora.agent.agi.eth", domain="compute", budget=1_000),
        Agent(address="0xAgent02", ens="pioneer.agent.agi.eth", domain="safety-lab", budget=500),
    ]

    state.initialise_registry(validator_agents, node_agents, worker_agents)

    demo = Demo(state)

    stake_manager = demo.onboard_validators(
        [(agent.address, agent.ens, 1_000) for agent in validator_agents]
    )

    demo.onboard_agents(worker_agents)

    committee_info = demo.run_validation_round(
        stake_manager=stake_manager,
        committee_size=3,
        truthful_outcome=True,
        round_id="alpha",
    )
    _display_committee_info(committee_info)

    digest = demo.demonstrate_batch_attestation(1_000)
    _display_proof_digest(digest)

    alert = demo.trigger_budget_overrun(worker_agents[0], overrun=250)
    _display_alert(alert)

    demo.governance_resume(worker_agents[0].domain)
    _display_resume(worker_agents[0].domain)

    report_payload = {
        "committee": committee_info,
        "proof_digest": digest,
        "alert": alert,
        "slash_events": stake_manager.event_log,
    }

    REPORT_PATH.write_text(json.dumps(report_payload, indent=2))
    EVENTS_PATH.write_text(json.dumps(stake_manager.event_log, indent=2))

    print("\n✅ Demo complete. Reports written to", REPORT_PATH)


if __name__ == "__main__":
    main()
