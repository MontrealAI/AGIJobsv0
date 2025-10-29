from pathlib import Path

from alpha_node.config import AlphaNodeConfig
from alpha_node.jobs import JobOpportunity
from alpha_node.planner import MuZeroPlanner


def test_planner_ranks_high_value_jobs(tmp_path):
    config = AlphaNodeConfig.load(Path('demo/AGI-Alpha-Node-v0/config.toml'))
    planner = MuZeroPlanner(config.planner)
    jobs = [
        JobOpportunity(
            job_id='A', domain='finance', reward=1000, stake_required=100,
            duration_hours=10, success_probability=0.9, impact_score=5, client='X'
        ),
        JobOpportunity(
            job_id='B', domain='finance', reward=10000, stake_required=200,
            duration_hours=8, success_probability=0.7, impact_score=9, client='Y'
        )
    ]
    decisions = planner.plan(jobs)
    assert decisions[0].job_id == 'B'
