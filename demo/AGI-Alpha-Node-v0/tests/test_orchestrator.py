from pathlib import Path

from alpha_node.knowledge import KnowledgeLake
from alpha_node.orchestrator import Orchestrator
from alpha_node.planner import MuZeroPlanner


def test_orchestrator_executes_job(tmp_path: Path) -> None:
    knowledge = KnowledgeLake(tmp_path / "knowledge.db")
    planner = MuZeroPlanner(depth=2, exploration_constant=0.5, learning_rate=0.2, knowledge=knowledge)
    orchestrator = Orchestrator(planner, knowledge)
    jobs = [
        {"job_id": "job-1", "description": "Deploy liquidity optimization strategy", "base_reward": 10.0, "risk": 0.2}
    ]
    outcome = orchestrator.execute(jobs)
    assert outcome.result.reward_estimate > 0
    assert outcome.plan.job_id == "job-1"
