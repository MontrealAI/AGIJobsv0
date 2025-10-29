from __future__ import annotations

from validator_constellation.demo_runner import run_validator_constellation_demo


def test_demo_runner_summary():
    summary = run_validator_constellation_demo(seed="pytest-seed", truthful_outcome=True)
    assert summary.committee
    assert summary.round_result in {True, False}
    assert summary.paused_domains == ["synthetic-biology"]
    assert summary.gas_saved > 0
    assert summary.batch_proof_root
    assert summary.indexed_events >= 1
    assert summary.timeline
    assert summary.timeline.get("commitDeadlineBlock") is not None
    assert summary.owner_actions
    assert len(summary.sentinel_alerts) >= 3
    assert any(event["domain"] == "synthetic-biology" for event in summary.domain_events)
