from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).resolve().parents[1] / "run_demo.py"
spec = importlib.util.spec_from_file_location("agi_labor_market_run_demo", MODULE_PATH)
if spec is None or spec.loader is None:  # pragma: no cover
    raise RuntimeError("Unable to load run_demo module")
run_demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_demo)


def test_parse_numeric_handles_units():
    assert run_demo._parse_numeric("13993.825 AGIα") == pytest.approx(13993.825)
    assert run_demo._parse_numeric(5) == 5.0
    assert run_demo._parse_numeric("not a number") is None


def test_load_and_summarize_sample_transcript():
    transcript_path = Path(run_demo.DEFAULT_TRANSCRIPT)
    transcript = run_demo.load_transcript(transcript_path)
    metrics = run_demo.summarize_telemetry(transcript)

    assert metrics["total_jobs"] == pytest.approx(2)
    assert metrics["minted_certificates"] == pytest.approx(2)
    assert metrics["pending_fees"] > 0


def test_format_summary_includes_key_metrics():
    metrics = {
        "total_jobs": 2,
        "minted_certificates": 2,
        "final_supply": 13993.825,
        "total_burned": 6.175,
        "total_agent_stake": 20.0,
        "total_validator_stake": 24.9,
        "pending_fees": 20.425,
    }

    summary = run_demo.format_summary(metrics)

    for phrase in [
        "Total jobs: 2",
        "Minted certificates: 2",
        "Final supply: 13993.825 AGIα",
        "Pending fees: 20.425 AGIα",
    ]:
        assert phrase in summary
