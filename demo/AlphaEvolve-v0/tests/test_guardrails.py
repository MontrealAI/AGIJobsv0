import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alphaevolve.config import GuardrailConfig
from alphaevolve.evaluator import SandboxViolation, _sandbox_guard
from alphaevolve.guardrails import enforce_guardrails
from alphaevolve.diff import ProposedDiff


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


def test_sandbox_blocks_forbidden_imports():
    diff = ProposedDiff.parse(
        "<<<<<< SEARCH\nvalue = 1\n======\nfrom os import system\n>>>>>>> REPLACE", source_model="test"
    )
    try:
        _sandbox_guard(diff)
    except SandboxViolation as err:
        assert "Import" in str(err)
    else:
        raise AssertionError("SandboxViolation was not raised for forbidden import")


def test_sandbox_blocks_dynamic_imports():
    diff = ProposedDiff.parse(
        "<<<<<< SEARCH\nvalue = 1\n======\nvalue = __import__('os').system\n>>>>>>> REPLACE", source_model="test"
    )
    try:
        _sandbox_guard(diff)
    except SandboxViolation as err:
        assert "Dynamic" in str(err)
    else:
        raise AssertionError("SandboxViolation was not raised for dynamic import")
