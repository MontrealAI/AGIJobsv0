"""Utilities for rendering mission plans and diagrams."""

from __future__ import annotations

from typing import Iterable, List

from .scenario import JobPlanNode


def render_mermaid(nodes: Iterable[JobPlanNode]) -> str:
    """Render a Mermaid flowchart illustrating the job graph."""

    lines: List[str] = ["flowchart TD"]
    for node in nodes:
        _render_node(node, lines)
    return "\n".join(lines) + "\n"


def _render_node(node: JobPlanNode, lines: List[str]) -> None:
    node_id = _mermaid_id(node.job_id)
    title = node.payload.get("title", node.job_id)
    reward = node.payload.get("reward_tokens", 0)
    energy = node.payload.get("energy_budget", 0)
    compute = node.payload.get("compute_budget", 0)
    lines.append(
        f"    {node_id}[\"{title}\\nReward: {reward:.0f} tokens\\nEnergy: {energy:.0f} | Compute: {compute:.0f}\"]"
    )
    for child in node.children:
        child_id = _mermaid_id(child.job_id)
        lines.append(f"    {node_id} --> {child_id}")
        _render_node(child, lines)


def _mermaid_id(value: str) -> str:
    safe = [ch if ch.isalnum() else "_" for ch in value]
    candidate = "".join(safe)
    return candidate or "job"
