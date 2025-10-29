from __future__ import annotations

import numpy as np

from tiny_recursive_model import DemoConfig, TinyRecursiveModelEngine


def _small_config() -> DemoConfig:
    config = DemoConfig.from_file(None)
    return config.merged(
        {
            "model": {
                "latent_dim": 8,
                "hidden_dim": 16,
                "inner_cycles": 2,
                "outer_steps": 2,
                "halt_threshold": 0.6,
                "learning_rate": 0.02,
            },
            "training": {
                "epochs": 2,
                "batch_size": 64,
            },
        }
    )


def test_infer_halts_within_bounds(tmp_path) -> None:
    config = _small_config()
    engine = TinyRecursiveModelEngine(config, tmp_path)
    dummy_input = np.zeros(config.model.input_dim)
    result = engine.infer(dummy_input)
    assert result["steps_used"] <= config.model.inner_cycles * config.model.outer_steps
    assert abs(float(result["halt_prob"])) <= 1


def test_training_executes(tmp_path) -> None:
    config = _small_config()
    engine = TinyRecursiveModelEngine(config, tmp_path)
    train, val = engine.build_curriculum(config.training, config.training.seed)
    report = engine.train(train, val)
    assert report.steps > 0
    accuracy = engine.evaluate_accuracy(val)
    assert 0.0 <= accuracy <= 1.0
