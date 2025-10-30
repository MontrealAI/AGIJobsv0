from __future__ import annotations

from pathlib import Path

from agi_alpha_node_demo.knowledge.lake import KnowledgeLake
from agi_alpha_node_demo.orchestration.planner import Planner


def test_planner_prioritizes_high_value_jobs(tmp_path: Path) -> None:
    lake_path = tmp_path / "knowledge.sqlite"
    lake = KnowledgeLake(lake_path)
    lake.store("Z", "finance", 0.6, {"note": "baseline"})
    lake.store("Y", "finance", 0.95, {"note": "premium"})
    planner = Planner(lake, rollout_depth=3, exploration_constant=0.0, simulations=16)
    jobs = [
        {"id": "A", "domain": "finance", "reward": 1000},
        {"id": "B", "domain": "biotech", "reward": 15000},
    ]
    plan = planner.plan(jobs)
    lake.close()
    assert plan[0].job_id == "A"
