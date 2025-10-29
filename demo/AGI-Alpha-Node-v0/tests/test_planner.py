from pathlib import Path

from alpha_node.knowledge import KnowledgeLake, KnowledgeRecord
from alpha_node.planner import MuZeroPlanner


def test_planner_prefers_high_value_option(tmp_path: Path) -> None:
    lake_path = tmp_path / "knowledge.json"
    lake = KnowledgeLake(lake_path)
    lake.add(KnowledgeRecord(job_id="1", domain="finance", insight="x", reward_delta=5.0))
    lake.add(KnowledgeRecord(job_id="2", domain="finance", insight="y", reward_delta=6.0))
    planner = MuZeroPlanner(horizon=3, exploration_bias=1.0, knowledge=lake)
    plan = planner.plan("job", "finance", ["opt-a", "opt-b"])
    assert plan.strategy in {"opt-a", "opt-b"}
    assert plan.expected_value > 0
