from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEMO_ROOT = PROJECT_ROOT / "demo" / "AGI-Jobs-Platform-at-Kardashev-II-Scale"
PYTHON_ENTRYPOINT = DEMO_ROOT / "run_demo.py"


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_check_mode(tmp_path: Path) -> None:
    """The wrapper should successfully delegate to the Node demo in check mode."""

    result = subprocess.run(
        [sys.executable, str(PYTHON_ENTRYPOINT), "--output-dir", str(tmp_path), "--check"],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "validated (check mode)" in result.stdout
    assert "Free energy margin" in result.stdout


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_produces_outputs(tmp_path: Path) -> None:
    """Running without --check should emit the expected report artefacts."""

    result = subprocess.run(
        [sys.executable, str(PYTHON_ENTRYPOINT), "--output-dir", str(tmp_path)],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    report = tmp_path / "kardashev-report.md"
    governance = tmp_path / "governance-playbook.md"
    telemetry = tmp_path / "kardashev-telemetry.json"

    for path in (report, governance, telemetry):
        assert path.exists(), f"expected artefact missing: {path}"

    telemetry_payload = json.loads(telemetry.read_text())
    assert telemetry_payload.get("energyMonteCarlo", {}).get("withinTolerance") is True
    assert telemetry_payload.get("dominanceScore")

    energy = telemetry_payload["energyMonteCarlo"]
    assert energy["maintainsBuffer"] is True
    assert energy["freeEnergyMarginGw"] > 0
    assert 0 < energy["freeEnergyMarginPct"] <= 1
    assert energy["gibbsFreeEnergyGj"] > 0
    assert 0 <= energy["hamiltonianStability"] <= 1
