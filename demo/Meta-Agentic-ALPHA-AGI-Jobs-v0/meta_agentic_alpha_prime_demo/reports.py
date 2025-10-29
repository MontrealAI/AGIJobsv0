"""Stakeholder friendly reporting for the Meta-Agentic Prime demo."""
from __future__ import annotations

from pathlib import Path

from .orchestrator import ExecutionSummary


def render_readable_report(summary: ExecutionSummary) -> str:
    """Render a Markdown report digestible by non-technical stakeholders."""
    lines: list[str] = []
    lines.append("# Meta-Agentic α-AGI Jobs Prime Demo Summary")
    lines.append("")
    lines.append(f"Generated at: **{summary.timestamp.isoformat()}**")
    lines.append("")
    lines.append("## Owner Controls Snapshot")
    for key, value in sorted(summary.owner_controls.items()):
        lines.append(f"- **{key.replace('_', ' ').title()}**: {value}")
    lines.append("")
    lines.append("## Opportunity Pipeline Overview")
    lines.append("````mermaid")
    lines.append(summary.mermaid_diagram)
    lines.append("````")
    lines.append("")

    identify = summary.phase_outputs.identify
    if identify:
        lines.append("### Identified α Opportunities")
        for opportunity in identify.opportunities:
            lines.append(
                f"- **{opportunity.domain.title()}**: {opportunity.description} — "
                f"Expected α: {opportunity.expected_alpha:.2f}, Risk: {opportunity.risk_score:.2f}"
            )
        lines.append("")

    learn = summary.phase_outputs.learn
    if learn:
        lines.append("### Continuous Learning Assets")
        for asset in learn.assets:
            lines.append(
                f"- **{asset.domain.title()}**: {asset.playbook} (Signal strength {asset.reinforcement_signal:.3f})"
            )
        lines.append("")

    think = summary.phase_outputs.think
    if think:
        lines.append("### Meta-Agentic Plans")
        for plan in think:
            lines.append(f"- **{plan.opportunity.domain.title()}**: {plan.rationale}")
            lines.append("  - Safeguards: " + ", ".join(plan.safeguards))
        lines.append("")

    design = summary.phase_outputs.design
    if design:
        lines.append("### Blueprinted Solutions")
        for artifact in design:
            lines.append(f"- **{artifact.plan.opportunity.domain.title()}**: {artifact.blueprint}")
            lines.append(
                "  - Resources: "
                + ", ".join(
                    f"{key.replace('_', ' ').title()}={value:.2f}" if isinstance(value, (int, float)) else f"{key}={value}"
                    for key, value in artifact.resource_requirements.items()
                )
            )
        lines.append("")

    strategies = summary.phase_outputs.strategise
    if strategies:
        lines.append("### Portfolio Strategy")
        for strategy in strategies:
            lines.append(
                f"- **Priority {strategy.priority}** — {strategy.design.plan.opportunity.domain.title()} "
                f"with allocation {strategy.allocation:.2f}"
            )
            lines.append("  - Stop conditions: " + ", ".join(strategy.stop_conditions))
        lines.append("")

    execution = summary.phase_outputs.execute
    if execution:
        lines.append("### Execution Orders")
        for order in execution:
            lines.append(
                f"- **{order.strategy.design.plan.opportunity.domain.title()}** actions: "
                + "; ".join(order.actions)
            )
            lines.append("  - Monitoring: " + ", ".join(order.monitoring_hooks))
        lines.append("")

    lines.append("## Next Actions For Owners")
    lines.append("1. Review the generated strategies in the governance console.")
    lines.append("2. Adjust owner controls if risk appetite or domain focus changes.")
    lines.append("3. Deploy execution orders via the AGI Jobs orchestrator with one click.")
    lines.append("")

    return "\n".join(lines)


def save_report_markdown(summary: ExecutionSummary, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(render_readable_report(summary), encoding="utf-8")

