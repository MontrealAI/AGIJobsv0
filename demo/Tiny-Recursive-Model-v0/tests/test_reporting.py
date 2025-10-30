"""Tests for executive reporting utilities."""

from __future__ import annotations

from pathlib import Path

from trm_demo.economic import EconomicLedger
from trm_demo.reporting import build_report, write_report
from trm_demo.simulation import SimulationOutcome, StrategyStats
from tiny_recursive_model_v0.ledger import EconomicLedger as PackageLedger
from tiny_recursive_model_v0.reporting import build_report as package_build_report
from tiny_recursive_model_v0.reporting import write_report as package_write_report
from tiny_recursive_model_v0.simulation import EngineSummary, SimulationReport
from tiny_recursive_model_v0.telemetry import TelemetryEvent


def _make_outcome() -> SimulationOutcome:
    strategies = {
        "trm": StrategyStats(name="Tiny Recursive Model", attempts=4, successes=3, total_cost=0.4, total_value=400.0),
        "llm": StrategyStats(name="LLM", attempts=4, successes=2, total_cost=0.2, total_value=200.0),
        "greedy": StrategyStats(name="Greedy Baseline", attempts=4, successes=1, total_cost=0.01, total_value=100.0),
    }
    return SimulationOutcome(
        strategies=strategies,
        trm_trajectory=[6, 5, 4, 6],
        sentinel_events=["Max cycles reached"],
    )


def _make_ledger() -> EconomicLedger:
    ledger = EconomicLedger()
    ledger.record_success(value=200.0, cost=0.2)
    ledger.record_failure(cost=0.1)
    ledger.record_success(value=200.0, cost=0.1)
    return ledger


def test_build_report_contains_mermaid_and_summary() -> None:
    outcome = _make_outcome()
    ledger = _make_ledger()
    report = build_report(outcome, ledger)
    assert "```mermaid" in report
    assert "Tiny Recursive Model vs Baselines" in report
    assert "TRM Outcomes" in report
    assert "Ledger Snapshot" in report


def test_write_report_creates_file(tmp_path: Path) -> None:
    outcome = _make_outcome()
    ledger = _make_ledger()
    destination = tmp_path / "report.md"
    path = write_report(outcome, ledger, destination)
    assert path.exists()
    contents = path.read_text()
    assert "Executive Dossier" in contents
    assert "Telemetry" not in contents  # ensure we are writing the dossier, not console output


def test_package_reporting_handles_simulation_report(tmp_path: Path) -> None:
    metrics = {
        "TRM": EngineSummary(
            name="TRM",
            attempts=4,
            conversions=3,
            conversion_rate=0.75,
            total_cost=0.4,
            gmv=400.0,
            profit=399.6,
            roi=999.0,
            notes="",
        ),
        "LLM": EngineSummary(
            name="LLM",
            attempts=4,
            conversions=2,
            conversion_rate=0.5,
            total_cost=0.2,
            gmv=200.0,
            profit=199.8,
            roi=999.0,
            notes="",
        ),
        "Greedy": EngineSummary(
            name="Greedy",
            attempts=4,
            conversions=1,
            conversion_rate=0.25,
            total_cost=0.01,
            gmv=100.0,
            profit=99.99,
            roi=999.0,
            notes="",
        ),
    }
    telemetry = [TelemetryEvent(event_type="SentinelStatus", payload={"paused": True, "reason": "ROI floor"})]
    report = SimulationReport(trm_training_accuracy=0.9, metrics=metrics, telemetry=telemetry)
    ledger = PackageLedger(value_per_success=100.0, base_compute_cost=0.001, cost_per_cycle=0.0001, daily_budget=50.0)
    ledger.record_success(cost=0.2, cycles_used=6, latency_ms=60.0)
    ledger.record_failure(cost=0.1, cycles_used=5, latency_ms=50.0)
    markdown = package_build_report(report, ledger)
    assert "TRM Outcomes" in markdown
    assert "Sentinel Interventions" in markdown
    destination = tmp_path / "package_report.md"
    generated = package_write_report(report, ledger, destination)
    assert generated.exists()
