import pathlib
import sys

import pytest

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

torch = pytest.importorskip("torch")

from muzero_demo.environment import AGIJobsPlanningEnv, EnvironmentConfig
from muzero_demo.mcts import PlannerSettings
from muzero_demo.thermostat import PlanningThermostat
from muzero_demo.configuration import ThermostatConfig


def test_thermostat_scales_with_entropy_and_budget():
    env_config = EnvironmentConfig(rng_seed=3)
    env = AGIJobsPlanningEnv(env_config)
    observation = env.reset()
    planner_settings = PlannerSettings(num_simulations=32)
    thermostat = PlanningThermostat(
        ThermostatConfig(min_simulations=8, max_simulations=96, low_entropy=0.4, high_entropy=1.2, budget_pressure_ratio=0.4),
        env_config,
        planner_settings,
    )
    uniform_policy = torch.full((env_config.max_jobs + 1,), 1.0 / (env_config.max_jobs + 1))
    high_entropy = thermostat.recommend(observation, uniform_policy, observation.legal_actions)
    assert high_entropy > planner_settings.num_simulations

    confident_policy = torch.zeros_like(uniform_policy)
    confident_policy[observation.legal_actions[0]] = 0.95
    confident_policy[observation.legal_actions[1]] = 0.05
    low_entropy = thermostat.recommend(observation, confident_policy, observation.legal_actions)
    assert low_entropy < planner_settings.num_simulations

    # Reduce budget to trigger protective expansion
    step_result = env.step(observation.legal_actions[0])
    low_budget_obs = step_result.observation
    pressure_policy = torch.full((env_config.max_jobs + 1,), 1.0 / (env_config.max_jobs + 1))
    pressured = thermostat.recommend(low_budget_obs, pressure_policy, low_budget_obs.legal_actions)
    assert pressured >= high_entropy
