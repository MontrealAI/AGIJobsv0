import json
import shutil
import subprocess
from pathlib import Path

import pytest

from orchestrator import planner
from orchestrator.models import PlanIn

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


def _build_plan(monkeypatch):
    monkeypatch.setattr(
        planner,
        "_generate_trace_id",
        lambda: "11111111-1111-1111-1111-111111111111",
    )

    return planner.make_plan(
        PlanIn(input_text="Post a 50 AGI job with deadline 5 days")
    )


def _ts_validator_available() -> bool:
    if shutil.which("node") is None:
        return False
    if (Path.cwd() / "node_modules" / "ts-node").exists():
        return True
    result = subprocess.run(
        ["node", "-e", "require('ts-node')"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


def test_create_job_ics_matches_fixture(monkeypatch):
    plan = _build_plan(monkeypatch)

    assert plan.ics is not None, "Planner should emit an ICS payload for complete jobs"

    fixture_path = FIXTURE_DIR / "create_job_complete.json"
    expected = json.loads(fixture_path.read_text())

    assert plan.ics == expected


def test_create_job_ics_validates_with_ts_validator(monkeypatch):
    if not _ts_validator_available():
        pytest.skip("TS validator requires node+ts-node; run npm ci to enable")

    plan = _build_plan(monkeypatch)
    assert plan.ics is not None, "Planner should emit an ICS payload for complete jobs"
    payload = json.dumps(plan.ics)

    subprocess.run(
        [
            "node",
            "--loader",
            "ts-node/esm",
            "-e",
            (
                "import { validateICS } from './packages/orchestrator/src/ics.ts';"
                "validateICS(process.argv[1]);"
            ),
            payload,
        ],
        check=True,
    )
