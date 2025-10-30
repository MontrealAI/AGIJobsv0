"""Reporting utilities producing markdown, json and mermaid artifacts."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List

from dataclasses import asdict

from .entities import AgentNode, DemoSnapshot, RunLedger


def render_markdown(
    ledger: RunLedger,
    history: Iterable[DemoSnapshot],
    best: AgentNode,
    nodes: Iterable[AgentNode],
) -> str:
    lines = [
        "# Huxley–Gödel Machine Demo Report",
        "",
        "This report captures the live evolution of the clade-metaproductive agent population",
        "driven end-to-end through AGI Jobs v0 (v2).",
        "",
        "## Key Outcomes",
        "",
        f"* **Gross Merchandise Value (GMV):** ${ledger.gmv:,.2f}",
        f"* **Operational Cost:** ${ledger.cost:,.2f}",
        f"* **Return on Investment (ROI):** {ledger.roi:,.2f}x",
        f"* **Total Successes:** {ledger.total_successes}",
        f"* **Total Failures:** {ledger.total_failures}",
        f"* **Best Lineage Representative:** `{best.identifier}` at depth {best.depth}",
        "",
        "## Iterative Trajectory",
        "",
        "| Iteration | Active Agents | Expansions | Evaluations | GMV | Cost | ROI | Champion |",
        "|-----------|---------------|------------|-------------|-----|------|-----|----------|",
    ]
    for snapshot in history:
        lines.append(
            "| {iteration} | {active_agents} | {total_expansions} | {total_evaluations} | ${gmv:,.2f} | ${cost:,.2f} | {roi:,.2f}x | {best} |".format(
                iteration=snapshot.iteration,
                active_agents=snapshot.active_agents,
                total_expansions=snapshot.total_expansions,
                total_evaluations=snapshot.total_evaluations,
                gmv=snapshot.gmv,
                cost=snapshot.cost,
                roi=snapshot.roi,
                best=snapshot.best_agent_id,
            )
        )
    lines.append("")
    lines.append("## Strategic Lineage Map")
    lines.append("")
    lines.append("```mermaid")
    lines.append(render_mermaid(best, nodes))
    lines.append("```")
    lines.append("")
    lines.append("This lineage map captures the clade-metaproductivity dynamics driving autonomous evolution.")
    return "\n".join(lines)
def render_mermaid(best: AgentNode, nodes: Iterable[AgentNode]) -> str:
    lines = ["graph TD"]
    for node in nodes:
        if node.parent_id is not None:
            lines.append(f"    {node.parent_id} -->|Δ| {node.identifier}")
    champion_label = f"Champion: {best.label} ({best.success_rate:.0%})"
    lines.append(f"    {best.identifier}[\"{champion_label}\"]")
    return "\n".join(lines)


def export_json(ledger: RunLedger, history: Iterable[DemoSnapshot], best: AgentNode, path: Path) -> None:
    payload = {
        "gmv": ledger.gmv,
        "cost": ledger.cost,
        "roi": ledger.roi,
        "successes": ledger.total_successes,
        "failures": ledger.total_failures,
        "history": [asdict(snapshot) for snapshot in history],
        "best_agent": {
            "id": best.identifier,
            "success_rate": best.success_rate,
            "depth": best.depth,
            "quality": best.quality,
        },
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


__all__ = ["render_markdown", "render_mermaid", "export_json"]
