from pathlib import Path

from trm_demo.config import TinyRecursiveModelConfig
from trm_demo.simulation import run_conversion_simulation


def test_simulation_generates_metrics(tmp_path: Path):
    config = TinyRecursiveModelConfig(epochs=1, batch_size=32, inner_cycles=3, outer_steps=2)
    output_path = tmp_path / "metrics.json"
    metrics = run_conversion_simulation(
        opportunities=30,
        seed=13,
        config=config,
        output_path=output_path,
        safety_relaxed=True,
    )
    assert len(metrics) == 3
    assert output_path.exists()
    strategies = {metric.strategy for metric in metrics}
    assert {"Greedy Baseline", "Large Language Model", "Tiny Recursive Model"}.issubset(strategies)
    trm_metric = next(metric for metric in metrics if metric.strategy == "Tiny Recursive Model")
    assert trm_metric.attempts > 0
    assert trm_metric.total_cost > 0

