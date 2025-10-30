import pathlib
import sys

import numpy as np

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from muzero_demo.configuration import SentinelConfig
from muzero_demo.environment import EnvironmentConfig, vector_size
from muzero_demo.sentinel import SentinelMonitor
from muzero_demo.training import Episode


def _dummy_episode(env_config: EnvironmentConfig, prediction: float, actual: float, budget: float) -> Episode:
    obs = np.zeros(vector_size(env_config), dtype=np.float32)
    action_policy = np.ones(env_config.max_jobs + 1, dtype=np.float32)
    action_policy /= action_policy.sum()
    return Episode(
        observations=[obs],
        actions=[0],
        rewards=[actual],
        policies=[action_policy],
        values=[prediction],
        returns=[actual],
        simulations=[16],
        summary={"remaining_budget": budget},
    )


def test_sentinel_detects_misalignment():
    env_config = EnvironmentConfig(starting_budget=120.0)
    sentinel = SentinelMonitor(
        SentinelConfig(window=10, alert_mae=5.0, fallback_mae=10.0, min_episodes=2, budget_floor=20.0),
        env_config,
    )

    sentinel.record_episode(_dummy_episode(env_config, prediction=2.0, actual=1.5, budget=80.0))
    status = sentinel.status()
    assert not status.alert_active

    sentinel.record_episode(_dummy_episode(env_config, prediction=20.0, actual=0.0, budget=10.0))
    status = sentinel.status()
    assert status.alert_active
    assert status.fallback_required
    assert status.budget_floor_breached
