"""Orchestrate the ASI Take-Off demo with guardrails and diagnostics.

This CLI wraps the existing shell automation (``bin/asi-takeoff-local.sh``)
with Python ergonomics:
- validates required assets exist before invoking heavy toolchains;
- surfaces environment variables in a structured way; and
- provides a quick readiness check without needing to read the Makefile.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="Run and validate the ASI Take-Off demo", invoke_without_command=True)
console = Console()

ROOT = Path(__file__).resolve().parent
SCRIPT_PATH = ROOT / "bin" / "asi-takeoff-local.sh"
DEFAULT_MISSION = ROOT / "config" / "mission@v2.json"
DEFAULT_THERMOSTAT = ROOT / "config" / "asi-takeoff.thermostat@v2.json"


@dataclass(frozen=True)
class DemoConfig:
    network: str = "localhost"
    report_scope: str = "asi-takeoff"
    report_title: str = "ASI Take-Off — Mission Report"
    deploy_output: Path | None = None
    mission_config: Path = DEFAULT_MISSION
    thermostat_config: Path = DEFAULT_THERMOSTAT

    def with_defaults(self) -> "DemoConfig":
        """Fill derived defaults (deploy output path) lazily."""
        if self.deploy_output is None:
            receipts_dir = ROOT.parent.parent / "reports" / self.network / self.report_scope / "receipts"
            return DemoConfig(
                network=self.network,
                report_scope=self.report_scope,
                report_title=self.report_title,
                deploy_output=receipts_dir / "deploy.json",
                mission_config=self.mission_config,
                thermostat_config=self.thermostat_config,
            )
        return self


def _require_command(command: str) -> None:
    if shutil.which(command) is None:
        console.print(f"[red]Missing required command: {command}[/red]")
        raise SystemExit(1)


def _validate_files(paths: Iterable[Path]) -> list[Path]:
    missing = [path for path in paths if not path.exists()]
    if missing:
        listed = "\n".join(str(path) for path in missing)
        console.print(f"[red]Required demo assets are missing:\n{listed}[/red]")
        raise SystemExit(1)
    return list(paths)


def _build_env(cfg: DemoConfig) -> dict[str, str]:
    cfg = cfg.with_defaults()
    return {
        "NETWORK": cfg.network,
        "AURORA_REPORT_SCOPE": cfg.report_scope,
        "AURORA_REPORT_TITLE": cfg.report_title,
        "AURORA_DEPLOY_OUTPUT": str(cfg.deploy_output),
        "AURORA_MISSION_CONFIG": str(cfg.mission_config),
        "AURORA_THERMOSTAT_CONFIG": str(cfg.thermostat_config),
    }


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """Show help when no subcommand is provided."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command()
def check() -> None:
    """Validate prerequisites for running the demo without executing it."""
    table = Table(title="ASI Take-Off Readiness", show_lines=True)
    table.add_column("Check")
    table.add_column("Status")

    try:
        _require_command("npx")
        table.add_row("npx available", "✅")
    except typer.Exit as exc:  # type: ignore[catching-non-exception]
        table.add_row("npx available", "❌")
        console.print(table)
        raise exc

    files = _validate_files([SCRIPT_PATH, DEFAULT_MISSION, DEFAULT_THERMOSTAT])
    for path in files:
        table.add_row(path.name, "✅")

    console.print(table)
    console.print("[green]All required assets are present. Use `python run_demo.py run` to execute.[/green]")


@app.command()
def run(
    network: str = typer.Option("localhost", help="Target network for the Hardhat/Anvil node."),
    report_scope: str = typer.Option("asi-takeoff", help="Namespace for generated receipts and reports."),
    report_title: str = typer.Option("ASI Take-Off — Mission Report", help="Title for generated telemetry reports."),
    deploy_output: Path = typer.Option(None, help="Override where deployment receipts are written."),
    mission_config: Path = typer.Option(DEFAULT_MISSION, help="Mission configuration file."),
    thermostat_config: Path = typer.Option(DEFAULT_THERMOSTAT, help="Thermostat configuration file."),
) -> None:
    """Execute the full demo via the existing shell harness."""
    _require_command("npx")
    cfg = DemoConfig(
        network=network,
        report_scope=report_scope,
        report_title=report_title,
        deploy_output=deploy_output,
        mission_config=mission_config,
        thermostat_config=thermostat_config,
    ).with_defaults()

    _validate_files([SCRIPT_PATH, cfg.mission_config, cfg.thermostat_config])

    env = os.environ.copy()
    env.update(_build_env(cfg))

    console.print("[cyan]Launching ASI Take-Off automation…[/cyan]")
    result = subprocess.run(["bash", str(SCRIPT_PATH)], env=env, check=False)
    if result.returncode:
        console.print("[red]Demo execution failed. Inspect logs for details.[/red]")
        raise SystemExit(result.returncode)
    console.print("[green]Demo completed successfully. Reports stored under `reports/`.[/green]")


if __name__ == "__main__":
    app()
