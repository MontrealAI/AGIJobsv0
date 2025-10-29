from __future__ import annotations

import torch

from tiny_recursive_model_v0.config import TrmConfig
from tiny_recursive_model_v0.engine import TinyRecursiveModelEngine


def make_config() -> TrmConfig:
    return TrmConfig(
        input_dim=8,
        latent_dim=16,
        hidden_dim=24,
        output_dim=2,
        inner_cycles=4,
        outer_steps=3,
        halt_threshold=0.5,
        max_cycles=12,
        ema_decay=0.9,
        learning_rate=0.001,
        weight_decay=0.0001,
        batch_size=16,
        epochs=2,
        device="cpu",
    )


def test_infer_returns_valid_probabilities():
    config = make_config()
    engine = TinyRecursiveModelEngine.from_config(config)
    features = torch.randn(5, config.input_dim)
    telemetry = engine.infer(features, halt_threshold=0.0)
    assert telemetry.steps_used <= config.outer_steps
    assert telemetry.cycles_used <= config.max_cycles
    assert telemetry.probabilities.shape == (5, config.output_dim)
    probs = telemetry.probabilities
    sums = probs.sum(dim=-1)
    assert torch.allclose(sums, torch.ones_like(sums), atol=1e-5)


def test_training_produces_metrics():
    config = make_config()
    engine = TinyRecursiveModelEngine.from_config(config)
    features = torch.randn(64, config.input_dim)
    labels = torch.randint(0, config.output_dim, (64,))
    report = engine.train(features, labels, epochs=1, batch_size=16)
    assert report.epochs == 1
    assert len(report.metrics) == 1
    metric = report.metrics[0]
    assert 0.0 <= metric.accuracy <= 1.0
    assert metric.loss >= 0.0
