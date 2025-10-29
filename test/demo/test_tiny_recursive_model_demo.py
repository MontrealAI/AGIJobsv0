"""Tests for the Tiny Recursive Model demo."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np

DEMO_ROOT = Path(__file__).resolve().parents[2] / "demo" / "Tiny-Recursive-Model-v0"
if str(DEMO_ROOT) not in sys.path:
    sys.path.append(str(DEMO_ROOT))

from trm_demo.economic import EconomicLedger
from trm_demo.engine import TinyRecursiveModel, TinyRecursiveModelConfig
from trm_demo.simulation import (
    ConversionSimulation,
    SimulationConfig,
    ground_truth_probability,
)
from trm_demo.sentinel import Sentinel
from trm_demo.subgraph import SubgraphConfig, SubgraphLogger
from trm_demo.thermostat import Thermostat
from trm_demo.utils import generate_candidate


def test_trm_halting_converges_quickly():
    config = TinyRecursiveModelConfig()
    model = TinyRecursiveModel(config=config)
    rng = np.random.default_rng(0)
    sample = generate_candidate("test", rng).as_feature_vector()
    result = model.infer(sample)
    assert 1 <= result.steps_used <= config.max_steps
    assert 0.0 <= result.prediction <= 1.0


def test_simulation_roi_advantage(tmp_path: Path):
    model = TinyRecursiveModel()
    simulation_config = SimulationConfig(opportunities=50)
    ledger = EconomicLedger()
    thermostat = Thermostat()
    sentinel = Sentinel()
    subgraph = SubgraphLogger(SubgraphConfig(tmp_path / "trm_calls.json"))
    rng = np.random.default_rng(123)

    simulation = ConversionSimulation(
        simulation_config,
        model,
        ledger,
        thermostat,
        sentinel,
        subgraph,
        rng=rng,
    )
    outcome = simulation.run()

    trm_stats = outcome.strategies["trm"]
    llm_stats = outcome.strategies["llm"]
    greedy_stats = outcome.strategies["greedy"]

    assert trm_stats.success_rate >= greedy_stats.success_rate
    assert trm_stats.roi > llm_stats.roi
    assert (trm_stats.total_value - trm_stats.total_cost) > (greedy_stats.total_value - greedy_stats.total_cost)


def test_training_updates_parameters():
    config = TinyRecursiveModelConfig()
    model = TinyRecursiveModel(config=config)
    rng = np.random.default_rng(42)
    dataset = []
    for _ in range(32):
        candidate = generate_candidate("train", rng)
        vector = candidate.as_feature_vector()
        dataset.append((vector, ground_truth_probability(vector)))

    before = json.loads(model.to_json())
    model.train(dataset, epochs=3, learning_rate=0.01)
    after = json.loads(model.to_json())

    assert before["b_y"] != after["b_y"]
    assert before["W_y"] != after["W_y"]

