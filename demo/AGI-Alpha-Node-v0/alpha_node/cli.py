"""Typer CLI for the Alpha Node demo."""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from web3 import Web3

from .compliance import ComplianceScorecard
from .config import AlphaNodeConfig, find_config
from .economy import StakeManagerClient
from .ens import ENSVerifier
from .governance import SystemPauseManager
from .jobs import TaskHarvester
from .knowledge import KnowledgeLake
from .metrics import MetricsExporter
from .orchestrator import Orchestrator
from .planner import MuZeroPlanner

console = Console()
app = typer.Typer(add_completion=False, help="Launch and operate the AGI Alpha Node demo")
logging.basicConfig(level=logging.INFO)


@app.command()
def bootstrap(config: Optional[str] = typer.Option(None, help="Path to config file")) -> None:
    """Bootstrap ENS verification, governance, and staking."""
    cfg = find_config(config)
    web3 = Web3(Web3.HTTPProvider(cfg.identity.rpc_url))
    if not web3.is_connected():
        raise typer.Exit(code=1)

    console.rule("[bold cyan]Identity Verification")
    verifier = ENSVerifier(cfg.identity.rpc_url)
    result = verifier.verify(cfg.identity.ens_domain, cfg.identity.operator_address)
    if not result.verified:
        console.print(f"[bold red]ENS verification failed:[/] {result.error}")
        raise typer.Exit(code=2)
    console.print(f"[bold green]ENS verified:[/] {cfg.identity.ens_domain} -> {result.resolved_owner}")

    console.rule("[bold cyan]Governance")
    manager = SystemPauseManager(web3, Path(cfg.storage.logs_path).with_suffix(".governance.json"))
    state = manager.bootstrap(cfg.identity.operator_address, cfg.identity.governance_address, cfg.security.pause_contract)
    console.print(f"[bold green]Governance ready:[/] owner {state.owner}, governance {state.governance_address}")

    console.rule("[bold cyan]Economy")
    stake_client = StakeManagerClient(
        web3,
        cfg.staking.stake_manager_address,
        cfg.staking.min_stake_wei,
        [token.__dict__ for token in cfg.staking.reward_tokens],
    )
    status = stake_client.deposit(cfg.staking.min_stake_wei, cfg.identity.operator_address)
    console.print(f"[bold green]Stake activated:[/] {status.staked_wei} wei staked")


@app.command()
def status(config: Optional[str] = typer.Option(None, help="Path to config file")) -> None:
    """Show current compliance scorecard."""
    cfg = find_config(config)
    web3 = Web3(Web3.HTTPProvider(cfg.identity.rpc_url))
    manager = SystemPauseManager(web3, Path(cfg.storage.logs_path).with_suffix(".governance.json"))
    state = manager.load()

    knowledge = KnowledgeLake(cfg.storage.knowledge_path)
    stake_client = StakeManagerClient(
        web3,
        cfg.staking.stake_manager_address,
        cfg.staking.min_stake_wei,
        [token.__dict__ for token in cfg.staking.reward_tokens],
    )
    status = stake_client.status()
    verifier = ENSVerifier(cfg.identity.rpc_url)
    ens_result = verifier.verify(cfg.identity.ens_domain, cfg.identity.operator_address)
    compliance = ComplianceScorecard().evaluate(
        ens_result=ens_result,
        stake_status=status,
        governance=state,
        planner_trend=0.9,
        antifragility_checks={"drill": True, "pause_resume": not state.paused},
    )

    table = Table(title="AGI Alpha Node Compliance")
    table.add_column("Dimension", style="cyan")
    table.add_column("Score", style="green")
    for dimension, value in compliance.__dict__.items():
        if dimension == "total":
            continue
        table.add_row(dimension.replace("_", " ").title(), f"{value:.3f}")
    table.add_row("Total", f"{compliance.total:.3f}")
    console.print(table)


@app.command()
def run(config: Optional[str] = typer.Option(None, help="Path to config file")) -> None:
    """Run orchestrator loop with dashboard and metrics."""
    cfg = find_config(config)
    web3 = Web3(Web3.HTTPProvider(cfg.identity.rpc_url))
    if not web3.is_connected():
        console.print("[bold red]Unable to connect to RPC provider")
        raise typer.Exit(code=1)

    knowledge = KnowledgeLake(cfg.storage.knowledge_path)
    planner = MuZeroPlanner(
        depth=cfg.planner.search_depth,
        exploration_constant=cfg.planner.exploration_constant,
        learning_rate=cfg.planner.learning_rate,
        knowledge=knowledge,
    )
    orchestrator = Orchestrator(planner, knowledge)
    harvester = TaskHarvester(web3, cfg.jobs.job_router_address, poll_interval=cfg.jobs.poll_interval_seconds)
    stake_client = StakeManagerClient(
        web3,
        cfg.staking.stake_manager_address,
        cfg.staking.min_stake_wei,
        [token.__dict__ for token in cfg.staking.reward_tokens],
    )
    metrics = MetricsExporter(cfg.metrics.prometheus_port)
    metrics.start()

    async def loop() -> None:
        completed = 0
        ens = ENSVerifier(cfg.identity.rpc_url)
        async for job in harvester.stream():
            jobs = [job.to_planner_dict()]
            outcome = orchestrator.execute(jobs)
            completed += 1
            stake_client.accrue_rewards(int(outcome.result.reward_estimate * 1e18))
            status = stake_client.status()
            compliance = ComplianceScorecard().evaluate(
                ens_result=ens.verify(cfg.identity.ens_domain, cfg.identity.operator_address),
                stake_status=status,
                governance=SystemPauseManager(web3, Path(cfg.storage.logs_path).with_suffix(".governance.json")).load(),
                planner_trend=min(1.0, 0.7 + completed * 0.02),
                antifragility_checks={"drill": completed % 5 != 0, "pause_resume": True},
            )
            metrics.update_compliance(compliance.total)
            metrics.update_stake(status.staked_wei)
            metrics.update_rewards(status.rewards_wei)
            metrics.increment_completions(completed)
            console.print(
                {
                    "job_id": outcome.plan.job_id,
                    "expected_reward": outcome.plan.expected_reward,
                    "specialist": outcome.result.specialist,
                    "compliance": compliance.total,
                }
            )

    try:
        asyncio.run(loop())
    except KeyboardInterrupt:
        console.print("[bold yellow]Shutting down Alpha Node")
    finally:
        harvester.stop()
        metrics.stop()


@app.command()
def export(config: Optional[str] = typer.Option(None, help="Path to config file")) -> None:
    """Export knowledge lake to JSON for audit."""
    cfg = find_config(config)
    knowledge = KnowledgeLake(cfg.storage.knowledge_path)
    entries = knowledge.latest(50)
    payload = [
        {
            "topic": entry.topic,
            "content": entry.content,
            "tags": entry.tags,
            "confidence": entry.confidence,
            "created_at": entry.created_at.isoformat(),
        }
        for entry in entries
    ]
    console.print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    app()
