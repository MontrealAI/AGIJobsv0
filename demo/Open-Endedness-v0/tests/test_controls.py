from __future__ import annotations

import importlib.util
import random
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_OMNI_DEMO_PATH = ROOT / "demo" / "Open-Endedness-v0" / "omni_demo.py"
_OMNI_DEMO_SPEC = importlib.util.spec_from_file_location(
    "demo.open_endedness_v0._test_omni_demo", _OMNI_DEMO_PATH
)
if _OMNI_DEMO_SPEC is None or _OMNI_DEMO_SPEC.loader is None:  # pragma: no cover - defensive
    raise ImportError("Unable to load omni_demo module for testing")
_OMNI_DEMO = importlib.util.module_from_spec(_OMNI_DEMO_SPEC)
sys.modules.setdefault(_OMNI_DEMO_SPEC.name, _OMNI_DEMO)
_OMNI_DEMO_SPEC.loader.exec_module(_OMNI_DEMO)
Simulator = _OMNI_DEMO.Simulator

from demo.open_endedness_v0 import (
    EconomicLedger,
    EconomicSnapshot,
    ModelOfInterestingness,
    OmniCurriculumEngine,
    Sentinel,
    SentinelConfig,
    ThermostatController,
)


@pytest.fixture()
def engine() -> OmniCurriculumEngine:
    descriptions = {
        "cta_opt": "Optimise premium CTA",
        "discount": "Optimise hiring discount",
        "match": "Autonomous talent matching",
    }
    return OmniCurriculumEngine(descriptions, rng=random.Random(9), moi_client=ModelOfInterestingness())


def test_economic_ledger_tracks_roi() -> None:
    ledger = EconomicLedger()
    ledger.record(
        step=1,
        strategy="OMNI",
        task_id="cta_opt",
        success=True,
        revenue=250.0,
        fm_cost=5.0,
        intervention_cost=5.0,
    )
    ledger.record(
        step=2,
        strategy="OMNI",
        task_id="cta_opt",
        success=False,
        revenue=0.0,
        fm_cost=0.0,
        intervention_cost=5.0,
    )
    summary = ledger.task_summary()["cta_opt"]
    assert summary["attempts"] == 2
    assert summary["successes"] == 1
    expected_roi = 250.0 / (5.0 + 10.0)
    assert summary["roi"] == pytest.approx(expected_roi)
    totals = ledger.totals()
    assert totals["roi_overall"] == pytest.approx(expected_roi)


def test_thermostat_adjusts_underperforming_engine(engine: OmniCurriculumEngine) -> None:
    ledger = EconomicLedger()
    for step in range(1, 4):
        ledger.record(
            step=step,
            strategy="OMNI",
            task_id="discount",
            success=True,
            revenue=15.0,
            fm_cost=6.0,
            intervention_cost=0.0,
        )
        engine.update_task_outcome("discount", 0.0)
    thermostat = ThermostatController(
        engine=engine,
        roi_target=6.0,
        roi_floor=3.0,
        min_moi_interval=5,
        max_moi_interval=40,
    )
    snapshot = EconomicSnapshot(conversions=1.0, revenue=15.0, fm_cost=6.0, intervention_cost=0.0)
    adjustments = thermostat.update(snapshot, ledger=ledger, step=4)
    assert adjustments, "Thermostat should emit adjustments when ROI dips"
    assert thermostat.events, "Thermostat must record an event"
    assert thermostat.current_interval >= 5
    assert engine.moi_client.boring_weight >= 0.002


def test_sentinel_disables_low_roi_tasks(engine: OmniCurriculumEngine) -> None:
    ledger = EconomicLedger()
    sentinel = Sentinel(
        engine=engine,
        config=SentinelConfig(task_roi_floor=0.1, overall_roi_floor=0.0, fm_cost_per_query=0.01),
    )
    for step in range(1, 6):
        ledger.record(
            step=step,
            strategy="OMNI",
            task_id="cta_opt",
            success=False,
            revenue=0.0,
            fm_cost=0.0,
            intervention_cost=0.0,
        )
        engine.update_task_outcome("cta_opt", 0.0)
    sentinel.evaluate(ledger, step=6)
    assert "cta_opt" in engine.disabled_tasks
    assert any(event["action"] == "sentinel_disable_task" for event in sentinel.events)


def test_sentinel_enforces_budget(engine: OmniCurriculumEngine) -> None:
    sentinel = Sentinel(
        engine=engine,
        config=SentinelConfig(budget_limit=0.05, fm_cost_per_query=0.05, moi_daily_max=10, qps_limit=1.0),
    )
    assert sentinel.can_issue_fm_query(step=1)
    sentinel.register_moi_query(step=1, fm_cost=0.05)
    assert not sentinel.can_issue_fm_query(step=2)
    assert any(event["action"] == "sentinel_budget_lock" for event in sentinel.events)


def test_lp_strategy_skips_disabled_tasks() -> None:
    sim = Simulator(
        strategy="lp",
        rng=random.Random(11),
        config={"owner": {"disabled_tasks": ["discount_optimizer"]}},
    )
    assert "discount_optimizer" in sim.engine.disabled_tasks
    sim.engine.tasks["discount_optimizer"].learning_progress = 0.9
    sim.engine.tasks["cta_refinement"].learning_progress = 0.2
    sim.engine.tasks["matchmaking_ai"].learning_progress = 0.1

    selections = {sim.pick_task(step=1)[0] for _ in range(5)}
    assert "discount_optimizer" not in selections
