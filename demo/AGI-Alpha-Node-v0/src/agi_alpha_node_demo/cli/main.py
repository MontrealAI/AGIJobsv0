"""Typer-based CLI for AGI Alpha Node demo."""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.logging import RichHandler
from ..orchestration.runtime import AlphaNodeRuntime, build_runtime
from ..safety.guards import SafetySnapshot

app = typer.Typer(help="Command console for the AGI Alpha Node demo")
console = Console()
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(console=console, rich_tracebacks=True)],
)


def _runtime(config_path: Optional[str], offline: bool) -> AlphaNodeRuntime:
    return build_runtime(config_path=config_path, offline=offline)


@app.command()
def bootstrap(
    config_path: Optional[str] = typer.Option(None, "--config", help="Path to the configuration file"),
    offline: bool = typer.Option(False, help="Use the in-memory blockchain simulator"),
) -> None:
    """Run ENS verification and staking checks."""

    runtime = _runtime(config_path, offline)
    console.rule("ENS Verification")
    ens_result = runtime.ens_verifier.verify()
    console.print_json(data=ens_result.as_dict())
    console.rule("Stake Verification")
    stake_status = runtime.stake_manager.ensure_minimum_stake(runtime.config.operator_address)
    console.print_json(data=stake_status.as_dict())
    console.rule("System Pause Status")
    pause = runtime.system_pause.status()
    console.print_json(data=pause.as_dict())


@app.command()
def run(
    config_path: Optional[str] = typer.Option(None, "--config", help="Configuration path"),
    once: bool = typer.Option(False, help="Execute a single iteration and exit"),
    offline: bool = typer.Option(False, help="Use the mock blockchain client"),
    dashboard_host: str = typer.Option("127.0.0.1", help="Metrics server host"),
    dashboard_port: int = typer.Option(8080, help="Metrics server port"),
    interval: float = typer.Option(15.0, help="Seconds between job cycles"),
) -> None:
    """Run the Alpha Node orchestrator."""

    runtime = _runtime(config_path, offline)
    if once:
        payload = asyncio.run(runtime.run_once())
        console.print_json(data=payload)
    else:
        console.print(f"Starting Alpha Node runtime – metrics at http://{dashboard_host}:{dashboard_port}")
        try:
            asyncio.run(runtime.run_forever(dashboard_host, dashboard_port, interval))
        except KeyboardInterrupt:
            console.print("Shutting down gracefully…")


@app.command()
def compliance(
    config_path: Optional[str] = typer.Option(None, "--config"),
    offline: bool = typer.Option(False, help="Use mock blockchain state"),
) -> None:
    """Compute and display the compliance scorecard."""

    runtime = _runtime(config_path, offline)
    payload = asyncio.run(runtime.run_once())
    console.rule("Compliance Scorecard")
    console.print_json(data=payload["compliance"])


@app.command()
def status(log_path: Path = typer.Option(Path("logs/alpha_node_runs.jsonl"), help="Path to run log")) -> None:
    """Display the most recent run status."""

    if not log_path.exists():
        console.print("No run logs available yet.")
        raise typer.Exit(code=1)
    with log_path.open("r", encoding="utf-8") as handle:
        lines = [line.strip() for line in handle if line.strip()]
    if not lines:
        console.print("Log file is empty")
        raise typer.Exit(code=1)
    console.print_json(data=json.loads(lines[-1]))


@app.command()
def drill(
    config_path: Optional[str] = typer.Option(None, "--config"),
    offline: bool = typer.Option(True, help="Drills use mock blockchain by default"),
) -> None:
    """Execute a safety drill and display the new antifragility score."""

    runtime = _runtime(config_path, offline)
    snapshot: SafetySnapshot = runtime.safety.run_drill()
    console.rule("Safety Drill Snapshot")
    console.print_json(data=snapshot.as_dict())


@app.command("serve-dashboard")
def serve_dashboard(
    directory: Path = typer.Option(Path("web/dashboard"), help="Dashboard directory"),
    host: str = typer.Option("127.0.0.1", help="Host to bind"),
    port: int = typer.Option(8080, help="Port to bind"),
) -> None:
    """Serve the static dashboard files."""

    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    import uvicorn

    app_fastapi = FastAPI(title="AGI Alpha Node Dashboard")
    app_fastapi.mount("/", StaticFiles(directory=directory, html=True), name="dashboard")
    console.print(f"Dashboard available at http://{host}:{port}")
    uvicorn.run(app_fastapi, host=host, port=port)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
