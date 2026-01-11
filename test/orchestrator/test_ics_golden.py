import json
from pathlib import Path

from orchestrator import planner
from orchestrator.models import PlanIn

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


def test_create_job_ics_matches_fixture(monkeypatch):
    monkeypatch.setattr(
        planner,
        "_generate_trace_id",
        lambda: "11111111-1111-1111-1111-111111111111",
    )

    plan = planner.make_plan(PlanIn(input_text="Post a 50 AGI job with deadline 5 days"))

    assert plan.ics is not None, "Planner should emit an ICS payload for complete jobs"

    fixture_path = FIXTURE_DIR / "create_job_complete.json"
    expected = json.loads(fixture_path.read_text())

    assert plan.ics == expected
