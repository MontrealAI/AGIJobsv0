from __future__ import annotations

from pathlib import Path
import sys

import yaml

MODULE_DIR = Path(__file__).parents[2] / "demo" / "Open-Endedness-v0"
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from engine import (  # type: ignore
    OmniConfig,
    OmniCurriculumEngine,
    StubInterestingnessOracle,
)
from simulator import FunnelSimulator, load_simulation_config  # type: ignore


def test_learning_progress_accumulates():
    oracle = StubInterestingnessOracle({})
    config = OmniConfig(
        fast_ema_beta=0.4,
        slow_ema_beta=0.9,
        lp_floor=1e-6,
        moi_weight_interesting=1.0,
        moi_weight_boring=0.001,
        min_probability=0.001,
        fallback_strategy="uniform",
        partition_update_interval=10,
        exploration_epsilon=0.0,
        exploration_decay=1.0,
    )
    engine = OmniCurriculumEngine(["task_a"], config=config, oracle=oracle)
    engine.update_outcome("task_a", success=False, value=0.0, cost=1.0)
    for _ in range(5):
        engine.update_outcome("task_a", success=True, value=1.0, cost=1.0)
    assert engine.metrics["task_a"].lp > 0


def test_stub_oracle_flags_redundant_tasks():
    oracle = StubInterestingnessOracle({"task_a": {"task_b"}})
    config = OmniConfig(
        fast_ema_beta=0.1,
        slow_ema_beta=0.01,
        lp_floor=1e-6,
        moi_weight_interesting=1.0,
        moi_weight_boring=0.001,
        min_probability=0.001,
        fallback_strategy="uniform",
        partition_update_interval=10,
        exploration_epsilon=0.0,
        exploration_decay=1.0,
    )
    engine = OmniCurriculumEngine(["task_a", "task_b"], config=config, oracle=oracle)
    for _ in range(5):
        engine.update_outcome("task_a", success=True, value=1.0, cost=1.0)
    engine.refresh_partition()
    assert not engine.interesting_flags["task_b"]


def test_simulator_runs_short_config(tmp_path: Path):
    config_path = Path(__file__).parents[2] / "demo" / "Open-Endedness-v0" / "config.demo.yaml"
    config_dict = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    config_dict["episodes"] = 10
    sim_config = load_simulation_config(config_dict)
    interestingness = config_dict["interestingness"]
    simulator = FunnelSimulator(sim_config, interestingness_config=interestingness)
    simulator.run()
    assert simulator.gmv >= 0
    assert simulator.cost > 0
    assert len(simulator.episode_results) <= 10
