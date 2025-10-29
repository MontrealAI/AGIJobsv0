import importlib.util
import pathlib

import pytest

MODULE_PATH = pathlib.Path(__file__).parents[1] / "omni_demo.py"


def load_module():
    spec = importlib.util.spec_from_file_location("omni_demo", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    import sys

    sys.modules[spec.name] = module
    spec.loader.exec_module(module)  # type: ignore[misc]
    return module


OMNI_DEMO = load_module()
EconomicLedger = OMNI_DEMO.EconomicLedger
ThermostatController = OMNI_DEMO.ThermostatController
SentinelSuite = OMNI_DEMO.SentinelSuite
OmniEngine = OMNI_DEMO.OmniEngine
MoIClient = OMNI_DEMO.MoIClient
baseline_tasks = OMNI_DEMO.baseline_tasks


@pytest.fixture()
def prompt_path():
    return MODULE_PATH.parent / "prompts" / "interestingness_prompt.md"


def test_economic_ledger_tracks_roi(prompt_path):
    ledger = EconomicLedger()
    spec = baseline_tasks()[0]
    # Successful attempt with FM cost
    ledger.record(step=1, strategy="OMNI", task=spec, success=True, revenue=spec.value, fm_cost=5.0)
    # Failed attempt
    ledger.record(step=2, strategy="OMNI", task=spec, success=False, revenue=0.0, fm_cost=0.0)
    summary = ledger.task_summary()[spec.task_id]
    assert summary["attempts"] == 2
    assert summary["successes"] == 1
    expected_roi = spec.value / ((spec.operational_cost * 2) + 5.0)
    assert summary["roi"] == pytest.approx(expected_roi)
    totals = ledger.totals()
    assert totals["roi_fm"] == pytest.approx(spec.value / 5.0)


def test_thermostat_adjusts_underperforming_engine(prompt_path):
    engine = OmniEngine(baseline_tasks(), MoIClient(prompt_path))
    ledger = EconomicLedger()
    spec = baseline_tasks()[1]
    # Record multiple low-value attempts with FM spend to drop ROI below floor
    for step in range(1, 4):
        ledger.record(step=step, strategy="OMNI", task=spec, success=True, revenue=10.0, fm_cost=5.0)
        engine.update_task_outcome(spec.task_id, 0.0)
    thermostat = ThermostatController({"roi_floor": 5.0})
    distribution = engine.distribution()
    thermostat.adjust(engine=engine, ledger=ledger, distribution=distribution, step=4)
    assert engine.interesting_weight < 1.0
    assert thermostat.events, "Thermostat should log the adjustment"


def test_sentinel_disables_low_roi_tasks(prompt_path):
    engine = OmniEngine(baseline_tasks(), MoIClient(prompt_path))
    ledger = EconomicLedger()
    spec = baseline_tasks()[0]
    for step in range(1, 5):
        ledger.record(step=step, strategy="OMNI", task=spec, success=False, revenue=0.0, fm_cost=0.0)
        engine.update_task_outcome(spec.task_id, 0.0)
    sentinel = SentinelSuite({"task_roi_floor": 0.1}, qps_limit=1.0, fm_cost_per_query=0.02)
    sentinel.evaluate(engine, ledger, step=5)
    distribution = engine.distribution()
    assert distribution[spec.task_id] == 0.0
    assert any(event["action"] == "sentinel_disable_task" for event in sentinel.events)


def test_sentinel_enforces_budget(prompt_path):
    thermostat = ThermostatController({"fm_budget_usd": 1.0})
    sentinel = SentinelSuite({}, qps_limit=1.0, fm_cost_per_query=10.0)
    assert not sentinel.can_issue_fm_query(1, thermostat)
    assert sentinel.events and sentinel.events[0]["action"] == "sentinel_budget_lock"
