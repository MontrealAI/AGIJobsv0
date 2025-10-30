import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src_path = ROOT / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from agi_alpha_node_demo.planner.muzero import MuZeroPlanner


def test_planner_prefers_high_reward():
    planner = MuZeroPlanner(search_depth=2, simulations=32, exploration_constant=1.2)
    reward_estimates = {
        "conservative": 10.0,
        "balanced": 15.0,
        "aggressive": 25.0,
    }
    random.seed(1234)
    decisions = [planner.plan("job-123", reward_estimates) for _ in range(12)]
    assert all(decision.strategy in reward_estimates for decision in decisions)
    aggressive_count = sum(1 for decision in decisions if decision.strategy == "aggressive")
    conservative_count = sum(1 for decision in decisions if decision.strategy == "conservative")
    assert aggressive_count >= conservative_count
    assert decisions[0].expected_reward > 0
