"""Executive reporting for the Tiny Recursive Model orchestrator stack."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict, Iterable, List

from .ledger import EconomicLedger
from .simulation import EngineSummary, SimulationReport
from .telemetry import TelemetryEvent


def _format_currency(value: float) -> str:
    if math.isinf(value):
        return "$∞"
    return f"${value:,.2f}"


def _format_ratio(value: float) -> str:
    if math.isinf(value):
        return "∞"
    return f"{value:.2f}"


def _render_summary(report: SimulationReport) -> str:
    lines = [
        "🏆 Tiny Recursive Model vs Baselines",
        "",
        "Engine             | Success Rate | ROI    | Total Value | Total Cost",
        "------------------ | ------------ | ------ | ----------- | ----------",
    ]
    for key in ("TRM", "LLM", "Greedy"):
        stats = report.metrics[key]
        lines.append(
            f"{stats.name:<18}| {stats.conversion_rate:>12.2%} | {stats.roi:>6.2f} | "
            f"${stats.gmv:>10.2f} | ${stats.total_cost:>9.4f}"
        )
    return "\n".join(lines)


def _ledger_snapshot(ledger: EconomicLedger) -> Dict[str, str]:
    entries = ledger.entries
    success_count = sum(1 for entry in entries if entry.success)
    total_events = len(entries)
    total_cost = ledger.total_cost
    total_value = ledger.total_value
    profit = total_value - total_cost
    roi = (profit / total_cost) if total_cost else (float("inf") if profit > 0 else 0.0)
    return {
        "total_events": str(total_events),
        "success_rate": f"{(success_count / total_events) if total_events else 0.0:.2%}",
        "roi": _format_ratio(roi),
        "total_value": _format_currency(total_value),
        "total_cost": _format_currency(total_cost),
    }


def _average_cycles(ledger: EconomicLedger) -> float:
    events = len(ledger.entries)
    if events == 0:
        return 0.0
    return ledger.total_cycles() / events


def _sentinel_events(telemetry: Iterable[TelemetryEvent]) -> List[str]:
    alerts: List[str] = []
    for event in telemetry:
        if event.event_type == "SentinelStatus" and event.payload.get("paused"):
            reason = event.payload.get("reason", "Sentinel pause triggered")
            alerts.append(str(reason))
    return alerts


def _build_flowchart(report: SimulationReport, ledger: EconomicLedger) -> str:
    stats: EngineSummary = report.metrics["TRM"]
    profit = stats.gmv - stats.total_cost
    avg_cycles = _average_cycles(ledger)
    sentinel_count = len(_sentinel_events(report.telemetry))
    ledger_roi = _format_ratio((ledger.total_value - ledger.total_cost) / ledger.total_cost if ledger.total_cost else float("inf"))
    return (
        "```mermaid\n"
        "flowchart LR\n"
        f"    O[Opportunities\\n{stats.attempts}] --> T[TRM Engine\\n"
        f"Conversions {stats.conversions}\\nAvg Cycles {avg_cycles:.2f}]\n"
        f"    T -->|GMV {_format_currency(stats.gmv)}| Value[GMV]\n"
        f"    T -->|Cost {_format_currency(stats.total_cost)}| Cost[Compute Spend]\n"
        f"    Value --> Profit[Profit {_format_currency(profit)}]\n"
        "    Cost --> Profit\n"
        f"    Sent[Sentinel Interventions {sentinel_count}] --> T\n"
        f"    Ledger[Ledger ROI {ledger_roi}] --> Profit\n"
        "```"
    )


def _build_outcome_pie(report: SimulationReport) -> str:
    stats: EngineSummary = report.metrics["TRM"]
    failures = max(stats.attempts - stats.conversions, 0)
    return (
        "```mermaid\n"
        "pie title TRM Outcomes\n"
        f"    \"Success\" : {stats.conversions}\n"
        f"    \"Failure\" : {failures}\n"
        "```"
    )


def build_report(report: SimulationReport, ledger: EconomicLedger) -> str:
    """Render a comprehensive executive report as Markdown."""

    summary_block = _render_summary(report)
    flowchart_block = _build_flowchart(report, ledger)
    pie_block = _build_outcome_pie(report)
    ledger_block = json.dumps(_ledger_snapshot(ledger), indent=2)
    sentinel_alerts = _sentinel_events(report.telemetry)

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

    if sentinel_alerts:
        sections.extend(["", "## Sentinel Interventions", ""])
        sections.extend([f"- {event}" for event in sentinel_alerts])

    return "\n".join(sections) + "\n"


def write_report(report: SimulationReport, ledger: EconomicLedger, path: Path | str) -> Path:
    """Persist the executive report to disk and return the resolved path."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(build_report(report, ledger), encoding="utf-8")
    return destination


__all__ = ["build_report", "write_report"]
