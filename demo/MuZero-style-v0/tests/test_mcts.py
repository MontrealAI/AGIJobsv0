import pathlib
import sys

import pytest

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

torch = pytest.importorskip("torch")

from muzero_demo import environment, mcts, network


def test_planner_returns_distribution():
    env_config = environment.EnvironmentConfig(rng_seed=5)
    net_config = network.NetworkConfig(
        observation_dim=environment.vector_size(env_config),
        action_space_size=env_config.max_jobs + 1,
        latent_dim=16,
        hidden_dim=32,
    )
    net = network.make_network(net_config)
    planner = mcts.MuZeroPlanner(net, mcts.PlannerSettings(num_simulations=8))
    env = environment.AGIJobsPlanningEnv(env_config)
    observation = env.reset()
    obs_tensor = torch.from_numpy(observation.vector).float()
    policy, value, _, simulations = planner.run(obs_tensor, observation.legal_actions)
    assert pytest.approx(float(policy.sum().item()), rel=1e-4) == 1.0
    assert len(policy) == env_config.max_jobs + 1
    assert isinstance(value, float)
    assert simulations == planner.settings.num_simulations
