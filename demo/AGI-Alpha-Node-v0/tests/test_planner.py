from __future__ import annotations

from agi_alpha_node.metrics import MetricsRegistry
from agi_alpha_node.planner import Planner
from agi_alpha_node.simulation import build_demo_components


def test_planner_prioritises_high_reward(config) -> None:
    components = build_demo_components(config)
    planner: Planner = components["planner"]
    jobs = [
        {"job_id": "A", "domain": "finance", "reward": 100},
        {"job_id": "B", "domain": "finance", "reward": 1000},
    ]
    plan = planner.plan(jobs)
    assert plan[0].job_id == "B"


def test_planner_adjusts_risk(config) -> None:
    components = build_demo_components(config)
    planner: Planner = components["planner"]
    initial_risk = planner.config.risk_tolerance
    planner.adjust_after_outcome(10000)
    assert planner.config.risk_tolerance > initial_risk
