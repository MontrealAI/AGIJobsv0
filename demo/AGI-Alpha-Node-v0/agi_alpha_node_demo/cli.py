"""Command-line interface for the AGI Alpha Node demo."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.table import Table

from .blockchain import BlockchainClient
from .compliance import ComplianceEngine
from .config import AlphaNodeConfig, ConfigValidationError, load_config
from .jobs import Job, sample_jobs
from .knowledge import KnowledgeLake, Insight
from .metrics import MetricsHub
from .orchestrator import Orchestrator
from .planner import MuZeroPlanner
from .safety import PauseController
from .specialists import SpecialistRegistry
from .utils import dataclass_to_clean_dict, env_flag

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

LOGGER = logging.getLogger("agi_alpha_node_demo.cli")
CONSOLE = Console()


def _load_config_or_exit(config_path: Path) -> AlphaNodeConfig:
    try:
        return load_config(config_path)
    except ConfigValidationError as exc:
        LOGGER.error("Configuration invalid: %s", exc)
        sys.exit(1)


def _build_dependencies(config: AlphaNodeConfig):
    blockchain = BlockchainClient(
        endpoint=config.network.chain_endpoint,
        chain_id=config.network.chain_id,
        ens_registry=config.network.ens_registry,
    )
    knowledge = KnowledgeLake(config.knowledge_db_path)
    specialists = SpecialistRegistry()
    planner = MuZeroPlanner(
        action_space=specialists.names().keys(),
        rollout_depth=config.planner.rollout_depth,
        simulations=config.planner.simulations,
        discount=config.planner.discount,
        exploration_constant=config.planner.exploration_constant,
    )
    orchestrator = Orchestrator(planner, knowledge, specialists)
    pause_controller = PauseController(Path(config.operator.pause_key_path), blockchain)
    metrics = MetricsHub(port=config.metrics.bind_port, host=config.metrics.bind_host)
    return blockchain, knowledge, specialists, planner, orchestrator, pause_controller, metrics


def _render_compliance(report) -> None:
    table = Table(title="AGI Alpha Node Compliance Scorecard")
    table.add_column("Dimension")
    table.add_column("Score")
    table.add_column("Rationale")
    for dimension in report.dimensions:
        table.add_row(dimension.name, f"{dimension.score:.3f}", dimension.rationale)
    table.add_section()
    table.add_row("Total", f"{report.total_score:.3f}", "Weighted average")
    CONSOLE.print(table)


@click.group()
@click.option("--config", type=click.Path(path_type=Path, exists=True), default=Path("./config.example.yaml"))
@click.option("--verbose/--quiet", default=False, help="Enable verbose logging")
@click.pass_context
def cli(ctx: click.Context, config: Path, verbose: bool) -> None:
    """Primary entrypoint for the AGI Alpha Node demo."""
    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    config = config.expanduser().resolve()
    ctx.obj = {
        "config_path": config,
        "config": _load_config_or_exit(config),
    }


@cli.command()
@click.option("--non-interactive", is_flag=True, help="Run without prompts for CI")
@click.pass_context
def bootstrap(ctx: click.Context, non_interactive: bool) -> None:
    """Bootstrap the node: ENS verification, staking check, knowledge initialisation."""
    config: AlphaNodeConfig = ctx.obj["config"]
    blockchain, knowledge, _, _, _, pause_controller, metrics = _build_dependencies(config)

    if non_interactive:
        LOGGER.info("Running bootstrap in non-interactive mode")
    else:
        click.confirm("Proceed with ENS verification and staking checks?", abort=True)

    result = blockchain.verify_ens_domain(config.operator.ens_domain, config.operator.owner_address)
    LOGGER.info("ENS domain resolved", extra=result.__dict__)

    stake_status = blockchain.update_stake(
        minimum_required=config.staking.minimum_stake,
        current=config.staking.current_stake,
    )
    LOGGER.info("Stake confirmed", extra=stake_status.__dict__)

    knowledge.store(
        Insight(topic="bootstrap", content="Node initialised and ready", confidence=0.8)
    )

    metrics.start()
    metrics.update_compliance(1.0)
    pause_controller.resume()
    click.echo("Bootstrap complete. Metrics running on port %d" % config.metrics.bind_port)


@cli.command("run-job")
@click.option("--scenario", type=click.Choice(["finance", "biotech", "manufacturing", "all"], case_sensitive=False), default="finance")
@click.pass_context
def run_job(ctx: click.Context, scenario: str) -> None:
    """Execute one or more demo jobs."""
    config: AlphaNodeConfig = ctx.obj["config"]
    blockchain, knowledge, specialists, planner, orchestrator, pause_controller, metrics = _build_dependencies(config)

    if pause_controller.is_paused():
        click.echo("Node is paused. Resume before executing jobs.")
        return

    jobs = sample_jobs() if scenario == "all" else [job for job in sample_jobs() if job.job_type == scenario]
    metrics.set_active_jobs(len(jobs))
    for job in jobs:
        result = orchestrator.execute(job)
        metrics.add_rewards(config.staking.token_symbol, job.reward)
        metrics.increment_specialist(job.job_type)
        blockchain.submit_job_result(job.job_id, {"status": result.status, "summary": result.planner_rationale})
        CONSOLE.print(f"Completed {job.job_id}: reinvested {result.reinvested:.2f}, distributed {result.distributed:.2f}")
    metrics.set_active_jobs(0)


@cli.command()
@click.option("--format", type=click.Choice(["table", "json"], case_sensitive=False), default="table")
@click.pass_context
def compliance(ctx: click.Context, format: str) -> None:
    """Generate the compliance scorecard."""
    config: AlphaNodeConfig = ctx.obj["config"]
    blockchain, *_ = _build_dependencies(config)
    engine = ComplianceEngine(config, blockchain)
    report = engine.evaluate()
    if format == "json":
        click.echo(json.dumps(report.to_dict(), indent=2))
    else:
        _render_compliance(report)


@cli.command()
@click.pass_context
def status(ctx: click.Context) -> None:
    """Display operational status."""
    config: AlphaNodeConfig = ctx.obj["config"]
    _, knowledge, specialists, planner, _, pause_controller, _ = _build_dependencies(config)
    insights = knowledge.query("bootstrap")
    table = Table(title="Alpha Node Status")
    table.add_column("Field")
    table.add_column("Value")
    table.add_row("ENS", config.operator.ens_domain)
    table.add_row("Owner", config.operator.owner_address)
    table.add_row("Governance", config.operator.governance_address)
    table.add_row("Paused", str(pause_controller.is_paused()))
    table.add_row("Specialists", ", ".join(specialists.names().keys()))
    table.add_row("Planner Simulations", str(planner.simulations))
    table.add_row("Knowledge Entries", str(len(insights)))
    CONSOLE.print(table)


@cli.command()
@click.pass_context
def pause(ctx: click.Context) -> None:
    """Pause all operations."""
    config: AlphaNodeConfig = ctx.obj["config"]
    blockchain, *_ = _build_dependencies(config)
    controller = PauseController(Path(config.operator.pause_key_path), blockchain)
    tx = controller.pause()
    click.echo(f"Pause triggered: {tx}")


@cli.command()
@click.pass_context
def resume(ctx: click.Context) -> None:
    """Resume operations."""
    config: AlphaNodeConfig = ctx.obj["config"]
    blockchain, *_ = _build_dependencies(config)
    controller = PauseController(Path(config.operator.pause_key_path), blockchain)
    tx = controller.resume()
    click.echo(f"Resume triggered: {tx}")


@cli.command()
@click.option("--once", is_flag=True, help="Run a single control loop iteration")
@click.pass_context
def run_loop(ctx: click.Context, once: bool) -> None:
    """Autonomous loop fetching jobs and executing them."""
    config: AlphaNodeConfig = ctx.obj["config"]
    blockchain, knowledge, specialists, planner, orchestrator, pause_controller, metrics = _build_dependencies(config)

    metrics.start()
    iteration = 0
    while True:
        iteration += 1
        LOGGER.info("Control loop iteration %d", iteration)
        if pause_controller.is_paused():
            LOGGER.warning("Node paused; waiting...")
            break
        jobs_ledger = blockchain.fetch_available_jobs()
        metrics.set_active_jobs(len(jobs_ledger))
        for job_id, details in jobs_ledger.items():
            job = Job(
                job_id=job_id,
                job_type=details["type"],
                payload={"objective": details["value"]},
                reward=1000.0,
                reinvestment_rate=config.jobs.default_reinvestment_rate,
            )
            orchestrator.execute(job)
            metrics.add_rewards(config.staking.token_symbol, job.reward)
            metrics.increment_specialist(job.job_type)
        metrics.set_active_jobs(0)
        if once:
            break


@cli.command()
@click.pass_context
def console(ctx: click.Context) -> None:
    """Launch an interactive console."""
    config: AlphaNodeConfig = ctx.obj["config"]
    click.echo("AGI Alpha Node console ready. Try 'status', 'compliance --format json', or 'run-job --scenario all'.")
    if env_flag("AGI_ALPHA_NODE_AUTORUN", default=False):
        click.echo("Autorun enabled; executing one job.")
        ctx.invoke(run_job, scenario="finance")
