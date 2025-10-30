import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alphaevolve.config import GuardrailConfig
from alphaevolve.guardrails import enforce_guardrails


BASELINE = {"Utility": 100.0, "Cost": 50.0, "Fairness": 0.9, "Latency": 0.3}
CONFIG = GuardrailConfig(
    max_cost_pct_baseline=1.1,
    min_utility_pct_baseline=0.95,
    min_fairness=0.8,
    rollback_on_latency_ms=400,
)


def test_guardrails_pass():
    metrics = {"Utility": 110.0, "Cost": 52.0, "Fairness": 0.85, "Latency": 0.35}
    outcome = enforce_guardrails(metrics, CONFIG, BASELINE)
    assert outcome.ok


def test_guardrails_fail_latency():
    metrics = {"Utility": 110.0, "Cost": 52.0, "Fairness": 0.85, "Latency": 0.5}
    outcome = enforce_guardrails(metrics, CONFIG, BASELINE)
    assert not outcome.ok
    assert "Latency" in outcome.message
