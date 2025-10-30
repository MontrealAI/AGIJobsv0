"""Executive reporting utilities for the Tiny Recursive Model demo."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict

from .economic import EconomicLedger
from .simulation import SimulationOutcome
from .ui import render_summary


def _format_currency(value: float) -> str:
    if math.isinf(value):
        return "$∞"
    return f"${value:,.2f}"


def _format_ratio(value: float) -> str:
    if math.isinf(value):
        return "∞"
    return f"{value:.2f}"


def _average_steps(outcome: SimulationOutcome) -> float:
    if not outcome.trm_trajectory:
        return 0.0
    return float(sum(outcome.trm_trajectory) / len(outcome.trm_trajectory))


def _ledger_snapshot(ledger: EconomicLedger) -> Dict[str, str]:
    metrics = ledger.to_dict()
    return {
        "total_events": f"{metrics['total_events']:.0f}",
        "success_rate": f"{metrics['success_rate']:.2%}",
        "roi": _format_ratio(metrics['roi']),
        "total_value": _format_currency(metrics['total_value']),
        "total_cost": _format_currency(metrics['total_cost']),
    }


def _build_flowchart(outcome: SimulationOutcome, ledger: EconomicLedger) -> str:
    stats = outcome.strategies["trm"]
    profit = stats.total_value - stats.total_cost
    avg_steps = _average_steps(outcome)
    sentinel_count = len(outcome.sentinel_events)
    ledger_roi = _format_ratio(ledger.roi)
    return (
        "```mermaid\n"
        "flowchart LR\n"
        f"    O[Opportunities\\n{stats.attempts}] --> T[TRM Engine\\n"
        f"Success {stats.successes}\\nAvg Steps {avg_steps:.2f}]\n"
        f"    T -->|GMV {_format_currency(stats.total_value)}| Value[GMV]\n"
        f"    T -->|Cost {_format_currency(stats.total_cost)}| Cost[Compute Spend]\n"
        f"    Value --> Profit[Profit {_format_currency(profit)}]\n"
        "    Cost --> Profit\n"
        f"    Sent[Sentinel Interventions {sentinel_count}] --> T\n"
        f"    Ledger[Ledger ROI {ledger_roi}] --> Profit\n"
        "```"
    )


def _build_outcome_pie(outcome: SimulationOutcome) -> str:
    stats = outcome.strategies["trm"]
    failures = max(stats.attempts - stats.successes, 0)
    return (
        "```mermaid\n"
        "pie title TRM Outcomes\n"
        f"    \"Success\" : {stats.successes}\n"
        f"    \"Failure\" : {failures}\n"
        "```"
    )


def build_report(outcome: SimulationOutcome, ledger: EconomicLedger) -> str:
    """Render a comprehensive executive report as Markdown."""

    summary_block = render_summary(outcome)
    flowchart_block = _build_flowchart(outcome, ledger)
    pie_block = _build_outcome_pie(outcome)
    ledger_block = json.dumps(_ledger_snapshot(ledger), indent=2)

    sections = [
        "# Tiny Recursive Model Executive Dossier",
        "",
        "## Scoreboard",
        "```",
        summary_block,
        "```",
        "",
        "## ROI Intelligence Flow",
        flowchart_block,
        "",
        "## Outcome Distribution",
        pie_block,
        "",
        "## Ledger Snapshot",
        "```json",
        ledger_block,
        "```",
    ]

    if outcome.sentinel_events:
        sections.extend(["", "## Sentinel Interventions", ""])
        sections.extend([f"- {event}" for event in outcome.sentinel_events])

    return "\n".join(sections) + "\n"


def write_report(outcome: SimulationOutcome, ledger: EconomicLedger, path: Path | str) -> Path:
    """Persist the executive report to disk and return the resolved path."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(build_report(outcome, ledger), encoding="utf-8")
    return destination


__all__ = ["build_report", "write_report"]
