from agi_alpha_node_demo.planner import MuZeroPlanner


def test_planner_returns_action():
    planner = MuZeroPlanner(action_space=["finance", "biotech"], rollout_depth=3, simulations=10, discount=0.95, exploration_constant=1.2)
    outcome = planner.plan({"alpha": 1.0, "risk": 0.3})
    assert outcome.selected_action in {"finance", "biotech"}
    assert outcome.expected_value >= 0
