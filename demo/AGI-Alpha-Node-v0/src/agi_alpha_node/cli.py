"""Typer CLI entrypoint for the AGI Alpha Node demo."""

from __future__ import annotations

import shutil
import time
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel

from .compliance import ComplianceEngine
from .config import AlphaNodeConfig
from .dashboard import DashboardRenderer
from .ens import ENSVerifier
from .knowledge import KnowledgeLake
from .logging_utils import configure_logging
from .metrics import metrics_context
from .orchestrator import Orchestrator
from .safety import SafetyManager
from .staking import StakeManagerClient

app = typer.Typer(help="Command console for the AGI Alpha Node demo")
console = Console()


def _load_config(path: Path) -> AlphaNodeConfig:
    return AlphaNodeConfig.load(path)


@app.command()
def init_config(output: Path = typer.Option(Path("operator.yaml"), help="Output config path")) -> None:
    """Generate a starter configuration for operators."""
    template = Path(__file__).resolve().parents[2] / "config.example.yaml"
    shutil.copyfile(template, output)
    console.print(Panel.fit(f"Starter configuration written to [bold]{output}[/]"))


@app.command()
def bootstrap(config_path: Path) -> None:
    """Run ENS + staking validation before activation."""
    config = _load_config(config_path)
    log_file = config.resolved_log_file(config_path.parent)
    configure_logging(str(log_file) if log_file else None)
    console.rule("ENS Verification")
    ens = ENSVerifier(config.ens, base_path=config.resolve_path("."))
    result = ens.verify()
    result.require_success()
    console.print(Panel(f"ENS {config.ens.name} verified for {config.ens.operator_address}"))

    console.rule("Staking Status")
    stake_client = StakeManagerClient(config.staking)
    status = stake_client.current_status()
    console.print(Panel(f"Stake: {status.staked_amount} (minimum {status.minimum_required})"))
    if not status.is_active:
        raise typer.Exit(code=2)
    console.print(Panel("Bootstrap checks passed", style="bold green"))


@app.command()
def compliance(
    config_path: Path,
    mermaid: bool = typer.Option(False, help="Emit Mermaid radar chart"),
    push_metrics: bool = typer.Option(False, help="Push scores to Prometheus exporter"),
) -> None:
    """Generate the governance-grade compliance scorecard."""
    config = _load_config(config_path)
    log_file = config.resolved_log_file(config_path.parent)
    configure_logging(str(log_file) if log_file else None)

    knowledge = KnowledgeLake(Path(config.knowledge_lake.database_path))
    ens = ENSVerifier(config.ens, base_path=config.resolve_path(".")).verify()
    stake = StakeManagerClient(config.staking).current_status()
    engine = ComplianceEngine()
    snapshot = engine.build_snapshot(
        ens=ens,
        stake=stake,
        governance_ready=True,
        antifragile_health=0.9,
        intelligence_velocity=0.92,
    )
    snapshot.render(console)
    if mermaid:
        console.print(snapshot.mermaid())
    if push_metrics:
        with metrics_context(config.metrics.prometheus_port) as metrics:
            metrics.update_compliance(snapshot.scores)
            time.sleep(0.5)


@app.command()
def rotate_governance(config_path: Path, new_address: str) -> None:
    """Simulate governance key rotation."""
    config = _load_config(config_path)
    console.print(Panel(f"Governance rotation scheduled to {new_address}"))
    knowledge = KnowledgeLake(Path(config.knowledge_lake.database_path))
    knowledge.add_entry("governance", f"Governance rotated to {new_address}")


@app.command()
def drill(config_path: Path) -> None:
    """Execute antifragility drill (pause/resume)."""
    config = _load_config(config_path)
    safety = SafetyManager(config.safety)
    safety.pause("Scheduled drill")
    try:
        safety.ensure_active()
    except RuntimeError:
        console.print("Drill pause confirmed")
    safety.resume()
    console.print("Node resumed after drill")


@app.command()
def run(
    config_path: Path,
    dashboard: Optional[Path] = typer.Option(None, help="Path to render dashboard HTML"),
    cycles: int = typer.Option(1, min=1, help="Number of job cycles to execute"),
    serve_dashboard: bool = typer.Option(False, help="Serve dashboard via uvicorn"),
) -> None:
    """Run the orchestrator for the configured number of cycles."""
    config = _load_config(config_path)
    log_file = config.resolved_log_file(config_path.parent)
    logger = configure_logging(str(log_file) if log_file else None)
    knowledge = KnowledgeLake(Path(config.knowledge_lake.database_path))
    safety = SafetyManager(config.safety)
    stake_client = StakeManagerClient(config.staking)
    orchestrator = Orchestrator(config, knowledge, stake_client, safety, console)
    orchestrator.load_specialists()

    ens_result = ENSVerifier(config.ens, base_path=config.resolve_path(".")).verify()
    if not ens_result.success and config.safety.pause_on_failed_ens:
        safety.pause("ENS verification failed")
        raise typer.Exit(code=2)

    engine = ComplianceEngine()

    with metrics_context(config.metrics.prometheus_port) as metrics:
        for cycle in range(cycles):
            logger.info("Cycle start", extra={"event": "cycle_start", "data": {"cycle": cycle}})
            execution = orchestrator.run_cycle()
            stake_status = stake_client.current_status()
            snapshot = engine.build_snapshot(
                ens=ens_result,
                stake=stake_status,
                governance_ready=True,
                antifragile_health=0.9,
                intelligence_velocity=min(0.99, 0.9 + 0.01 * (cycle + 1)),
            )
            metrics.update_compliance(snapshot.scores)
            if dashboard:
                renderer = DashboardRenderer(Path(__file__).resolve().parents[2] / "web" / "index.template.html")
                renderer.render(
                    output_path=dashboard,
                    compliance=snapshot,
                    economic_metrics=[
                        {"value": f"{stake_status.staked_amount}", "label": "Staked $AGIALPHA"},
                        {"value": f"{stake_status.rewards_available}", "label": "Rewards Available"},
                        {"value": f"{execution.expected_reward:.2f}", "label": "Planner Expected Reward"},
                    ],
                    governance_insights=[
                        f"Global pause active: {safety.state.paused}",
                        "Governance address rotated via CLI",
                    ],
                    strategic_insights=[
                        f"Job {execution.job.job_id} executed", "Knowledge entries: accelerating",
                    ],
                    action_url="https://github.com/MontrealAI/AGIJobsv0",
                    mermaid_diagram="""flowchart LR; A[Planner]-->B[Orchestrator]; B-->C[Specialists]; C-->D[Knowledge]; D-->A""",
                )
            logger.info("Cycle complete", extra={"event": "cycle_complete", "data": {"cycle": cycle}})
            time.sleep(0.1)

    if serve_dashboard and dashboard:
        try:
            from fastapi import FastAPI
            import uvicorn
        except ImportError as exc:  # pragma: no cover
            console.print(f"FastAPI not available: {exc}")
            return
        app_fastapi = FastAPI()

        @app_fastapi.get("/")
        def _root() -> str:  # pragma: no cover
            return Path(dashboard).read_text()

        console.print("Serving dashboard at http://0.0.0.0:{config.metrics.dashboard_port}")
        uvicorn.run(app_fastapi, host="0.0.0.0", port=config.metrics.dashboard_port)


if __name__ == "__main__":  # pragma: no cover
    app()
