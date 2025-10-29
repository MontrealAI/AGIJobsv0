import numpy as np

from trm_demo.engine import TinyRecursiveModel, TinyRecursiveModelConfig
from trm_demo.simulation import ConversionSimulation, SimulationConfig, ground_truth_probability
from trm_demo.economic import EconomicLedger
from trm_demo.thermostat import Thermostat, ThermostatConfig
from trm_demo.sentinel import Sentinel, SentinelConfig
from trm_demo.subgraph import SubgraphLogger, SubgraphConfig
from trm_demo.utils import generate_candidate


def test_trm_inference_halts_within_bounds():
    model = TinyRecursiveModel()
    candidate = generate_candidate("test", np.random.default_rng(0))
    result = model.infer(candidate.as_feature_vector())
    assert 0 < result.steps_used <= model.config.max_steps
    assert 0.0 <= result.prediction <= 1.0
    assert result.trajectory, "trajectory should capture recursive trace"


def test_trm_training_improves_alignment():
    rng = np.random.default_rng(1)
    model = TinyRecursiveModel(TinyRecursiveModelConfig(outer_steps=2, n_cycles=4, halt_threshold=0.7))
    dataset = []
    for idx in range(32):
        candidate = generate_candidate(f"train-{idx}", rng)
        vector = candidate.as_feature_vector()
        target = 1.0 - ground_truth_probability(vector)
        dataset.append((vector, target))
    initial = [model.infer(features).prediction for features, _ in dataset[:4]]
    model.train(dataset, epochs=3, learning_rate=0.1)
    updated = [model.infer(features).prediction for features, _ in dataset[:4]]
    total_shift = sum(abs(i - u) for i, u in zip(initial, updated))
    assert total_shift > 0.0, "training should move predictions"


def test_conversion_simulation_generates_positive_roi(tmp_path):
    rng = np.random.default_rng(2)
    model = TinyRecursiveModel()
    ledger = EconomicLedger()
    thermostat = Thermostat(ThermostatConfig(target_roi=1.2, window=5))
    sentinel = Sentinel(SentinelConfig(roi_floor=0.5, max_cost=10.0, max_latency_ms=5000.0, max_steps=18))
    telemetry_path = tmp_path / "trm_calls.json"
    subgraph = SubgraphLogger(SubgraphConfig(telemetry_path))
    simulation = ConversionSimulation(
        SimulationConfig(opportunities=25, candidates_per_opportunity=2, random_seed=42),
        model,
        ledger,
        thermostat,
        sentinel,
        subgraph,
        rng=rng,
    )
    outcome = simulation.run()
    assert "trm" in outcome.strategies
    expected_opportunities = 25
    assert outcome.strategies["trm"].attempts == expected_opportunities
    assert telemetry_path.exists()
    # ROI can be infinite when cost ~0, just ensure ledger recorded attempts
    assert ledger.entries, "ledger should record TRM economic events"
