from __future__ import annotations

import json

from validator_constellation.config import SystemConfig
from validator_constellation.demo_runner import (
    run_validator_constellation_demo,
    run_validator_constellation_scenario,
    summary_to_dict,
    write_web_artifacts,
)


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
    assert summary.event_feed
    assert len(summary.event_feed) == summary.indexed_events
    assert any(event["type"] == "SentinelAlert" for event in summary.event_feed)


def test_summary_to_dict_contains_event_feed():
    summary = run_validator_constellation_demo(seed="pytest-dict", truthful_outcome=False)
    data = summary_to_dict(summary)
    assert data["committee"] == summary.committee
    assert data["eventFeed"] == summary.event_feed
    assert data["indexedEvents"] == summary.indexed_events


def test_demo_runner_accepts_overrides():
    summary = run_validator_constellation_demo(
        seed="override-seed",
        truthful_outcome=True,
        committee_size=2,
        job_count=10,
        config_overrides={"quorum": 2},
        budget_limit=750.0,
    )
    assert len(summary.committee) == 2
    assert summary.gas_saved == 10 * SystemConfig().gas_saved_per_job
    assert summary.context["committeeSize"] == 2
    assert summary.context["batchSize"] == 10
    assert summary.context["budgetLimit"] == 750.0
    assert summary.context["configOverrides"] == {"quorum": 2}


def test_web_artifact_export(tmp_path):
    summary = run_validator_constellation_demo(seed="pytest-web", truthful_outcome=True)
    manifest = write_web_artifacts(summary, tmp_path / "data")
    events_path = manifest["events"]
    assert events_path.exists()
    events = json.loads(events_path.read_text())
    assert len(events) == len(summary.event_feed)
    summary_data = json.loads(manifest["summary"].read_text())
    assert summary_data["truthfulOutcome"] == summary.truthful_outcome
    timeline_data = json.loads(manifest["timeline"].read_text())
    assert timeline_data["commitStartBlock"] == summary.timeline["commitStartBlock"]
    owner_actions = json.loads(manifest["owner_actions"].read_text())
    assert owner_actions


def test_scenario_truthful_override(tmp_path):
    scenario = {
        "baseSetup": {
            "recentBeacon": "scenario-seed",
            "governance": {"committeeSize": 3, "quorumPercentage": 66},
        },
        "validators": [
            {"address": "0x1", "ens": "atlas.club.agi.eth", "stake": "32"},
            {"address": "0x2", "ens": "zephyr.club.agi.eth", "stake": "32"},
            {"address": "0x3", "ens": "nova.club.agi.eth", "stake": "32"},
        ],
        "job": {"truthfulVote": False, "count": 3},
    }
    path = tmp_path / "scenario.yaml"
    path.write_text(json.dumps(scenario))
    scenario_summary = run_validator_constellation_scenario(
        path, truthful_override=True
    )
    assert scenario_summary.truthful_outcome is True
    assert scenario_summary.round_result in {True, False}
