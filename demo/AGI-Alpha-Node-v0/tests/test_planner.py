from pathlib import Path

from alpha_node.knowledge import KnowledgeLake
from alpha_node.planner import MuZeroPlanner


def test_planner_proposes_job(tmp_path: Path) -> None:
    knowledge = KnowledgeLake(tmp_path / "knowledge.db")
    planner = MuZeroPlanner(depth=3, exploration_constant=1.0, learning_rate=0.1, knowledge=knowledge)
    jobs = [
        {"job_id": "job-a", "description": "Optimize robotics network", "base_reward": 12.0, "risk": 0.1},
        {"job_id": "job-b", "description": "Synthesize novel compound", "base_reward": 8.0, "risk": 0.3},
    ]
    candidate = planner.propose(jobs, simulations=10)
    assert candidate.job_id in {"job-a", "job-b"}
    assert candidate.expected_reward >= 0
