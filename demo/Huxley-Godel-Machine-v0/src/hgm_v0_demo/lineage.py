"""Utilities for capturing and visualising HGM agent lineages."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

from .engine import AgentNode, AgentStatus, HGMEngine
from .metrics import AgentSnapshot


def capture_agent_snapshots(engine: HGMEngine) -> List[AgentSnapshot]:
    """Serialize the current agent population into snapshot records.

    The ordering is deterministic (sorted by depth then identifier) so that
    downstream visualisations remain stable between runs.
    """

    def _sort_key(node: AgentNode) -> tuple[int, str]:
        return (node.depth, node.agent_id)

    snapshots: List[AgentSnapshot] = []
    for node in sorted(engine.agents(), key=_sort_key):
        snapshots.append(
            AgentSnapshot(
                agent_id=node.agent_id,
                parent_id=node.parent_id,
                depth=node.depth,
                quality=node.quality,
                status=node.status.value,
                direct_success=node.direct_success,
                direct_failure=node.direct_failure,
                clade_success=node.clade_success,
                clade_failure=node.clade_failure,
                inflight_expansions=node.inflight_expansions,
                inflight_evaluations=node.inflight_evaluations,
            )
        )
    return snapshots


@dataclass
class MermaidOptions:
    highlight_agent: str | None = None


def mermaid_from_snapshots(
    snapshots: Sequence[AgentSnapshot],
    *,
    options: MermaidOptions | None = None,
) -> str:
    """Construct a Mermaid graph describing the lineage."""

    opts = options or MermaidOptions()
    lines: List[str] = ["graph TD"]
    for snapshot in snapshots:
        label = (
            f"{snapshot.agent_id}[{snapshot.agent_id}\\n"
            f"q={snapshot.quality:.2f}\\n"
            f"S={snapshot.direct_success}/F={snapshot.direct_failure}\\n"
            f"C={snapshot.clade_success}/{snapshot.clade_failure}]"
        )
        lines.append(label)
        if snapshot.parent_id:
            lines.append(f"{snapshot.parent_id} --> {snapshot.agent_id}")
    if opts.highlight_agent:
        lines.append(
            f"style {opts.highlight_agent} fill:#f4d03f,stroke:#f1c40f,stroke-width:4px"
        )
    for snapshot in snapshots:
        if snapshot.status != AgentStatus.ACTIVE.value:
            fill = "#7f8c8d"
            if snapshot.status == AgentStatus.PRUNED.value:
                fill = "#7f8c8d"
            elif snapshot.status == AgentStatus.PAUSED.value:
                fill = "#5dade2"
            lines.append(
                f"style {snapshot.agent_id} fill:{fill},stroke:#2c3e50,stroke-width:2px"
            )
    return "\n".join(lines)


def capture_mermaid(engine: HGMEngine, *, highlight: str | None = None) -> str:
    """Convenience helper that captures agents and renders Mermaid text."""

    snapshots = capture_agent_snapshots(engine)
    return mermaid_from_snapshots(snapshots, options=MermaidOptions(highlight_agent=highlight))


__all__ = [
    "MermaidOptions",
    "capture_agent_snapshots",
    "capture_mermaid",
    "mermaid_from_snapshots",
]
