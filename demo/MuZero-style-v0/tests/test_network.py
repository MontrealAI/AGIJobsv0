import pathlib
import sys

import pytest

torch = pytest.importorskip("torch")

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from muzero_demo import network, environment


def test_network_inference_shapes():
    config = environment.EnvironmentConfig(rng_seed=1)
    net_config = network.NetworkConfig(
        observation_dim=environment.vector_size(config),
        action_space_size=config.max_jobs + 1,
        latent_dim=16,
        hidden_dim=32,
    )
    net = network.make_network(net_config)
    observation = torch.zeros(net_config.observation_dim)
    policy, value, hidden = net.initial_inference(observation.unsqueeze(0))
    assert policy.shape[-1] == config.max_jobs + 1
    assert hidden.shape[-1] == net_config.latent_dim
    assert -1.0 <= value.item() <= 1.0
