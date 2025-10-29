from pathlib import Path

import pytest

from agi_alpha_node.config import AlphaNodeConfig
from agi_alpha_node.knowledge import KnowledgeLake
from agi_alpha_node.planner import MuZeroPlanner
from agi_alpha_node.task_router import Job


@pytest.fixture()
def planner(tmp_path: Path) -> MuZeroPlanner:
    config = AlphaNodeConfig.load(Path(__file__).resolve().parents[1] / "config.example.yaml")
    knowledge = KnowledgeLake(tmp_path / "knowledge.db")
    return MuZeroPlanner(config.planner, knowledge)


def test_planner_prefers_high_reward(planner: MuZeroPlanner) -> None:
    job_low = Job("job-low", "finance", complexity=0.2, reward=1000, payload={})
    job_high = Job("job-high", "finance", complexity=0.3, reward=9000, payload={})
    plan = planner.plan([job_low, job_high])
    assert plan.job.job_id == "job-high"
    assert plan.expected_reward > 0
