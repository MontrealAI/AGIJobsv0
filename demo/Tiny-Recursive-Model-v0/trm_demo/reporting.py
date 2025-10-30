"""Generate human-readable reports for Tiny Recursive Model simulations."""
from __future__ import annotations

from pathlib import Path

from .simulation import SimulationSummary


def build_report(summary: SimulationSummary) -> str:
    """Render a Markdown report from simulation results."""
    lines = [
        "# Tiny Recursive Model Demo Report",
        "",
        "| Model | Success Rate | ROI | Avg Latency (ms) | Total Cost |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, metrics in (
        ("Greedy", summary.greedy),
        ("Large LLM", summary.llm),
        ("Tiny Recursive Model", summary.trm),
    ):
        success_rate = metrics.successes / metrics.trials if metrics.trials else 0.0
        lines.append(
            f"| {name} | {success_rate:.2%} | {metrics.roi():.2f} | {metrics.avg_latency():.1f} | ${metrics.total_cost:.4f} |"
        )
    if summary.sentinel_triggered:
        lines.append("")
        lines.append(f"> Sentinel triggered: {summary.sentinel_reason}")
    return "\n".join(lines)


def write_report(path: str | Path, summary: SimulationSummary) -> Path:
    """Persist a Markdown report to disk."""
    path = Path(path)
    path.write_text(build_report(summary), encoding="utf-8")
    return path


__all__ = ["build_report", "write_report"]
