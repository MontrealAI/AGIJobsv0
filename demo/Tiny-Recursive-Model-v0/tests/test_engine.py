from __future__ import annotations

import torch

from tiny_recursive_model_v0.config import TrmConfig
from tiny_recursive_model_v0.engine import TinyRecursiveModelEngine, TinyRecursiveNetwork


def make_config() -> TrmConfig:
    return TrmConfig.from_dict(
        {
            "model": {
                "input_dim": 4,
                "latent_dim": 8,
                "hidden_dim": 12,
                "output_dim": 2,
            },
            "recursion": {
                "inner_cycles": 2,
                "outer_steps": 3,
                "max_cycles": 6,
            },
            "optimizer": {"learning_rate": 0.05, "weight_decay": 0.0},
            "training": {"batch_size": 4, "epochs": 3},
            "device": {"device": "cpu"},
            "roi": {"halt_threshold": 0.5},
            "ema_decay": 0.9,
        }
    )


def test_recursive_updates_depend_on_inner_cycles():
    torch.manual_seed(0)
    config = make_config()
    network = TinyRecursiveNetwork(
        config.model.input_dim,
        config.model.latent_dim,
        config.model.hidden_dim,
        config.model.output_dim,
    )
    features = torch.randn(2, config.model.input_dim)
    logits_short, _ = network(features, inner_cycles=1, outer_steps=2)
    logits_long, _ = network(features, inner_cycles=3, outer_steps=2)
    assert not torch.allclose(logits_short[-1], logits_long[-1])


def test_halting_triggers_early_exit():
    config = make_config()
    engine = TinyRecursiveModelEngine.from_config(config)
    with torch.no_grad():
        for param in engine.model.parameters():
            param.zero_()
        engine.model.halt_head[-1].bias.copy_(torch.tensor([-10.0, 10.0]))
    features = torch.randn(4, config.model.input_dim)
    telemetry = engine.infer(features, halt_threshold=0.6, use_ema=False)
    assert telemetry.steps_used == 1
    assert telemetry.halted_early
    assert telemetry.halt_probabilities[0] > 0.6


def test_engine_overfits_tiny_dataset():
    config = make_config()
    engine = TinyRecursiveModelEngine.from_config(config)
    features = torch.tensor(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.9, 0.1, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.9, 0.1, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.9, 0.1],
        ],
        dtype=torch.float32,
    )
    labels = torch.tensor([0, 0, 1, 1, 0, 0], dtype=torch.long)
    engine.train(features, labels, epochs=40, batch_size=6, seed=1)
    telemetry = engine.infer(features, halt_threshold=0.0, use_ema=False)
    predictions = telemetry.logits.argmax(dim=-1)
    accuracy = (predictions == labels).float().mean().item()
    assert accuracy > 0.9
