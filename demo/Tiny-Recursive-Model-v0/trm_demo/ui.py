"""Presentation helpers for the Tiny Recursive Model demo."""

from __future__ import annotations

from .simulation import SimulationOutcome


def render_summary(outcome: SimulationOutcome) -> str:
    """Return a human friendly multi-line summary for CLI output."""

    lines = [
        "🏆 Tiny Recursive Model vs Baselines",
        "",
        "Strategy            | Success Rate | ROI    | Total Value | Total Cost",
        "------------------- | ------------ | ------ | ----------- | ----------",
    ]
    for key in ("trm", "llm", "greedy"):
        stats = outcome.strategies[key]
        lines.append(
            f"{stats.name:<19}| {stats.success_rate:>12.2%} | {stats.roi:>6.2f} | "
            f"${stats.total_value:>10.2f} | ${stats.total_cost:>9.4f}"
        )

    if outcome.trm_trajectory:
        avg_steps = sum(outcome.trm_trajectory) / len(outcome.trm_trajectory)
        lines.append("")
        lines.append(f"Average TRM recursion steps: {avg_steps:.2f}")
    if outcome.sentinel_events:
        lines.append("")
        lines.append("Sentinel interventions detected:")
        for reason in outcome.sentinel_events:
            lines.append(f" • {reason}")

    return "\n".join(lines)

