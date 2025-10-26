"""Command line launcher for the Omega-grade demo."""

from __future__ import annotations

import argparse
import asyncio
import logging
from typing import List

from .agents import EnergyAgent, FinanceAgent, SupplyChainAgent, ValidatorAgent
from .config import DemoConfig
from .governance import GovernanceConsole
from .messaging import MessageBus
from .orchestrator import Orchestrator
from .resources import ResourceManager
from .simulation import SyntheticEconomySim

logger = logging.getLogger(__name__)


def build_demo(owner: str, *, checkpoint_path: str) -> Orchestrator:
    config = DemoConfig(owner=owner, checkpoint_path=checkpoint_path)
    bus = MessageBus()
    resources = ResourceManager(config)
    governance = GovernanceConsole(config)
    simulation = SyntheticEconomySim()
    orchestrator = Orchestrator(
        config,
        bus=bus,
        resources=resources,
        governance=governance,
        simulation=simulation,
    )
    agents = [
        FinanceAgent("finance_alpha", ["finance"], orchestrator, bus, resources),
        EnergyAgent("energy_alpha", ["energy"], orchestrator, bus, resources),
        SupplyChainAgent("supply_chain_alpha", ["supply_chain"], orchestrator, bus, resources),
    ]
    validators = [ValidatorAgent(f"validator_{idx}", [], orchestrator, bus, resources) for idx in range(config.validator_count)]
    orchestrator.register_agents(agents, validators=validators)
    return orchestrator


async def orchestrate(args: argparse.Namespace) -> None:
    orchestrator = build_demo(args.owner, checkpoint_path=args.checkpoint)
    governance = orchestrator.governance_console()
    if args.pause:
        governance.pause(caller=args.owner)
    if args.resume:
        governance.resume(caller=args.owner)

    # Seed with a flagship job to demonstrate recursive delegation.
    if args.autopilot:
        await orchestrator.post_alpha_job(
            {
                "skills": ["finance"],
                "description": "Assemble Kardashev-II liquidity wave",
                "compute": 4.0,
                "energy_gw": 2.0,
                "spawn_supply_chain": True,
            },
            employer=args.owner,
            reward=args.reward,
        )

    await orchestrator.run(cycles=args.cycles if args.cycles else None, cycle_sleep=args.sleep)


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Kardashev-II Omega-Grade α-AGI Business 3 Demo")
    parser.add_argument("--owner", default="omega-operator", help="Address or name of the contract owner")
    parser.add_argument("--checkpoint", default="omega_demo_checkpoint.json", help="Checkpoint file path")
    parser.add_argument("--autopilot", action="store_true", help="Launch with a flagship α-job queued")
    parser.add_argument("--pause", action="store_true", help="Start the system in paused mode")
    parser.add_argument("--resume", action="store_true", help="Force a resume command before launch")
    parser.add_argument("--reward", type=float, default=5_000.0, help="Reward for the seeded flagship job")
    parser.add_argument("--cycles", type=int, default=5, help="Number of orchestration cycles to run (0 for infinite)")
    parser.add_argument("--sleep", type=float, default=0.1, help="Seconds to sleep between orchestration cycles")
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> None:
    args = parse_args(argv)
    cycles = None if args.cycles == 0 else args.cycles
    args.cycles = cycles
    asyncio.run(orchestrate(args))


if __name__ == "__main__":
    main()
