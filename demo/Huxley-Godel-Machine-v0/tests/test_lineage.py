from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))

from hgm_v0_demo.lineage import MermaidOptions, mermaid_from_snapshots
from hgm_v0_demo.metrics import AgentSnapshot


def test_mermaid_builder_highlights_agent() -> None:
    snapshots = [
        AgentSnapshot(
            agent_id="agent-0000",
            parent_id=None,
            depth=0,
            quality=0.5,
            status="active",
            direct_success=1,
            direct_failure=0,
            clade_success=1,
            clade_failure=0,
            inflight_expansions=0,
            inflight_evaluations=0,
        ),
        AgentSnapshot(
            agent_id="agent-0001",
            parent_id="agent-0000",
            depth=1,
            quality=0.7,
            status="active",
            direct_success=2,
            direct_failure=1,
            clade_success=3,
            clade_failure=1,
            inflight_expansions=0,
            inflight_evaluations=0,
        ),
    ]

    diagram = mermaid_from_snapshots(snapshots, options=MermaidOptions(highlight_agent="agent-0001"))
    assert "graph TD" in diagram
    assert "agent-0000 --> agent-0001" in diagram
    assert "style agent-0001 fill:#f4d03f" in diagram
