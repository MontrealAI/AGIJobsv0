"""Utilities for building visual artefacts used by the demo outputs."""
from __future__ import annotations

from .engine import HGMEngine


def lineage_mermaid_diagram(engine: HGMEngine) -> str:
    lines = ["graph TD"]
    for agent in engine.list_agents():
        label = (
            f"{agent.agent_id}[{agent.agent_id}\\n"
            f"q={agent.quality:.2f}\\n"
            f"S={agent.successes}/F={agent.failures}\\n"
            f"CMP={agent.cmp_score:.2f}]"
        )
        lines.append(label)
        if agent.parent_id:
            lines.append(f"{agent.parent_id} --> {agent.agent_id}")
    return "\n".join(lines)


__all__ = ["lineage_mermaid_diagram"]
