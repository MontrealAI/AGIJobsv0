import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from orchestrator import planner
from orchestrator.models import PlanIn

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
ROOT = Path(__file__).resolve().parents[2]


def test_create_job_ics_matches_fixture(monkeypatch, tmp_path):
    if shutil.which("node") is None:
        pytest.skip("node runtime not available; skipping ICS validation")
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

    payload_path = tmp_path / "payload.json"
    payload_path.write_text(json.dumps(plan.ics))

    script = (
        "import { readFileSync } from 'node:fs';"
        "(async () => {"
        "const mod = await import('./packages/orchestrator/src/ics.ts');"
        "const validate = mod.validateICS ?? (mod.default && mod.default.validateICS);"
        "if (!validate) { throw new Error('validateICS not available'); }"
        "const data = readFileSync(process.argv[1], 'utf8');"
        "validate(data);"
        "})();"
    )

    env = {**os.environ, "TS_NODE_COMPILER_OPTIONS": "{\"module\":\"esnext\",\"moduleResolution\":\"node\"}"}

    subprocess.run(
        ["node", "--loader", "ts-node/esm", "-e", script, str(payload_path)],
        cwd=ROOT,
        check=True,
        env=env,
    )
