import pathlib
import sys

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from muzero_demo.environment import AGIJobsPlanningEnv, EnvironmentConfig, vector_size


def test_environment_reset_and_step():
    config = EnvironmentConfig(rng_seed=123)
    env = AGIJobsPlanningEnv(config)
    observation = env.reset()
    assert observation.vector.shape[0] == vector_size(config)
    assert len(observation.legal_actions) == config.max_jobs + 1

    step = env.step(observation.legal_actions[0])
    assert isinstance(step.reward, float)
    assert step.observation.vector.shape[0] == vector_size(config)
    summary = env.summarize_history()
    assert "total_reward" in summary
