from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def test_demo_entrypoint_runs_and_writes_output(tmp_path: Path) -> None:
    demo_root = Path(__file__).resolve().parents[1]
    output_path = tmp_path / "telemetry.json"

    result = subprocess.run(
        [
            sys.executable,
            str(demo_root / "demo.py"),
            "--max-seconds",
            "0.01",
            "--quiet",
            "--output",
            str(output_path),
        ],
        cwd=demo_root,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert output_path.exists()

    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["telemetry"]["iterations"] >= 0
    assert payload["telemetry"]["success_rate"] >= 0
