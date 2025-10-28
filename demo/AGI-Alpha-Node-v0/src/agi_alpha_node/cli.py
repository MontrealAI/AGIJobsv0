from __future__ import annotations

import argparse
import json
import signal
import sys
import time
from pathlib import Path
from typing import Callable, Dict, Optional

from rich.console import Console
from rich.json import JSON
from rich.panel import Panel

from .compliance import ComplianceReport
from .config import Config, ConfigError, load_config
from .governance import GovernanceController
from .logging_utils import json_log
from .orchestrator import Orchestrator

console = Console()


def _load(path: Path) -> Config:
    try:
        return load_config(path)
    except ConfigError as exc:
        console.print(f"[bold red]Configuration error:[/bold red] {exc}")
        raise SystemExit(1) from exc


def _build_orchestrator(config_path: Path) -> Orchestrator:
    config = _load(config_path)
    return Orchestrator(config)


def command_run(args: argparse.Namespace) -> None:
    orchestrator = _build_orchestrator(Path(args.config))
    console.print(Panel.fit("Launching AGI Alpha Node orchestrator", subtitle="Superintelligent economic engine"))

    should_stop = False

    def _handle_signal(signum, _frame) -> None:  # noqa: ANN001
        nonlocal should_stop
        console.print(f"Received signal {signum}; shutting down gracefully...")
        should_stop = True

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    orchestrator.start()
    console.print("[green]Node is live.[/green] Press Ctrl+C to exit.")
    json_log("cli_run_started")
    try:
        while not should_stop:
            time.sleep(1)
    finally:
        orchestrator.stop()
        json_log("cli_run_stopped")


def command_status(args: argparse.Namespace) -> None:
    orchestrator = _build_orchestrator(Path(args.config))
    status = orchestrator.status()
    orchestrator.stop()
    console.print(JSON.from_data(status))


def _render_compliance(report: ComplianceReport) -> None:
    console.print(report.to_table())
    console.print("\n[bold]Antifragility drills[/bold]")
    console.print(JSON.from_data(report.antifragility_report))


def command_compliance(args: argparse.Namespace) -> None:
    orchestrator = _build_orchestrator(Path(args.config))
    report = orchestrator.run_compliance()
    orchestrator.stop()
    _render_compliance(report)


def command_pause(args: argparse.Namespace) -> None:
    orchestrator = _build_orchestrator(Path(args.config))
    orchestrator.governance().pause(args.reason)
    orchestrator.stop()
    console.print(f"System paused for reason: {args.reason}")


def command_resume(args: argparse.Namespace) -> None:
    orchestrator = _build_orchestrator(Path(args.config))
    orchestrator.governance().resume()
    orchestrator.stop()
    console.print("System resumed")


def command_governance(args: argparse.Namespace) -> None:
    orchestrator = _build_orchestrator(Path(args.config))
    controller: GovernanceController = orchestrator.governance()
    if args.transfer:
        controller.transfer_governance(args.transfer)
        console.print(f"Transferred governance to {args.transfer}")
    console.print(JSON.from_data(controller.status()))
    orchestrator.stop()


def command_export_state(args: argparse.Namespace) -> None:
    orchestrator = _build_orchestrator(Path(args.config))
    state = orchestrator.components.blockchain.export_state()
    orchestrator.stop()
    Path(args.output).write_text(json.dumps(state, indent=2))
    console.print(f"Exported state to {args.output}")


def command_metrics(args: argparse.Namespace) -> None:
    orchestrator = _build_orchestrator(Path(args.config))
    metrics = orchestrator.metrics_snapshot()
    orchestrator.stop()
    console.print(metrics)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AGI Alpha Node operator console")
    parser.add_argument("--config", default="demo/AGI-Alpha-Node-v0/config/operator.example.yaml", help="Path to config file")
    subparsers = parser.add_subparsers(dest="command")

    run_parser = subparsers.add_parser("run", help="Run the orchestrator")
    run_parser.set_defaults(func=command_run)

    status_parser = subparsers.add_parser("status", help="Show node status")
    status_parser.set_defaults(func=command_status)

    compliance_parser = subparsers.add_parser("compliance", help="Generate compliance report")
    compliance_parser.set_defaults(func=command_compliance)

    pause_parser = subparsers.add_parser("pause", help="Pause node operations")
    pause_parser.add_argument("--reason", default="Operator requested pause")
    pause_parser.set_defaults(func=command_pause)

    resume_parser = subparsers.add_parser("resume", help="Resume node operations")
    resume_parser.set_defaults(func=command_resume)

    governance_parser = subparsers.add_parser("governance", help="Governance utilities")
    governance_parser.add_argument("--transfer", help="Transfer governance to a new address")
    governance_parser.set_defaults(func=command_governance)

    export_parser = subparsers.add_parser("export-state", help="Export blockchain state snapshot")
    export_parser.add_argument("--output", default="demo/AGI-Alpha-Node-v0/state/export.json")
    export_parser.set_defaults(func=command_export_state)

    metrics_parser = subparsers.add_parser("metrics", help="Print metrics snapshot")
    metrics_parser.set_defaults(func=command_metrics)

    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "func"):
        parser.print_help()
        return 1
    args.func(args)
    return 0


app = main
