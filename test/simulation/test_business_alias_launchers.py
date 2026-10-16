"""Real bounded local simulations launched from an unrelated working directory."""

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
WRAPPERS = [
    ("demo/Kardashev-II Omega-Grade-α-AGI Business-3/bin/run.sh", "--cycles"),
    (
        "demo/Kardashev-II-Omega-Grade-Alpha-AGI-Business-3/bin/run-demo.sh",
        "--max-cycles",
    ),
]


@pytest.mark.parametrize("script,cycles", WRAPPERS)
@pytest.mark.parametrize("help_only", [True, False])
def test_unrelated_cwd_without_pythonpath(tmp_path, script, cycles, help_only):
    env = os.environ.copy()
    env.pop("PYTHONPATH", None)
    env["PATH"] = str(Path(sys.executable).parent) + os.pathsep + env["PATH"]
    args = ["--help"] if help_only else [cycles, "3", "--no-resume"]
    if not help_only:
        args += ["--checkpoint", str(tmp_path / "checkpoint.json")]
        if cycles == "--cycles":
            for flag in [
                "--control",
                "--audit-log",
                "--status-output",
                "--energy-oracle",
            ]:
                args += [flag, str(tmp_path / (flag[2:] + ".jsonl"))]
    result = subprocess.run(
        ["bash", str(ROOT / script), *args],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
    if help_only:
        assert "usage:" in result.stdout.lower()
    else:
        rows = [
            json.loads(line)
            for line in result.stderr.splitlines()
            if line.startswith("{")
        ]
        events = {row.get("event") for row in rows}
        assert {
            "orchestrator_start",
            "job_posted",
            "cycle_limit_reached",
            "orchestrator_stopped",
        } <= events
        assert any(row.get("cycle") == 3 for row in rows)
        # Bounded shutdown is intentional; this test does not claim job finalization.
