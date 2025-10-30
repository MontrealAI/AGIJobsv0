from __future__ import annotations

import json
from pathlib import Path

from alphaevolve_v0 import heuristics
from alphaevolve_v0.diff_engine import extract_parameters, render_parameter_diff
from alphaevolve_v0.evaluator import EvaluationHarness

CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "alphaevolve.json"


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())


def load_source() -> str:
    return Path(heuristics.__file__).read_text()


def test_baseline_metrics_are_reasonable() -> None:
    harness = EvaluationHarness(load_source(), load_config())
    metrics = harness.baseline_metrics
    assert metrics["Utility"] > 0
    assert 0 <= metrics["Fairness"] <= 1
    assert metrics["Latency"] > 0


def test_lower_risk_adjustment_can_improve_metrics() -> None:
    source = load_source()
    params = extract_parameters(source)
    updated = dict(params)
    updated["RISK_PENALTY"] = round(updated["RISK_PENALTY"] * 0.8, 2)
    diff = render_parameter_diff("unit-test", previous=params, updated=updated)
    harness = EvaluationHarness(source, load_config())
    candidate = harness.evaluate_diff(diff)
    assert candidate.metrics["Risk"] <= harness.baseline_metrics["Risk"] + 1e-4
