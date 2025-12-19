from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

PHASE_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PHASE_ROOT / "run_demo.py"
OUTPUT_PATH = PHASE_ROOT / "output" / "phase8_run_report.json"
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


def test_run_demo_script_generates_report():
    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH)],
        cwd=PHASE_ROOT,
        capture_output=True,
        text=True,
        check=True,
        env=dict(os.environ),
    )

    assert "Dominance score" in result.stdout
    assert OUTPUT_PATH.exists(), "Report file should be created by run_demo.py"

    payload = json.loads(OUTPUT_PATH.read_text())
    assert payload["totals"]["monthlyUSD"] > 0
    assert 0 <= payload["coverage"]["ratio"] <= 1
    assert 0 <= payload["totals"]["dominanceScore"] <= 100
    assert payload["resilience"]["cadenceSeconds"] > 0


def test_report_addresses_are_normalised():
    payload = json.loads(OUTPUT_PATH.read_text())
    for field, value in payload["global"].items():
        assert value.startswith("0x"), f"{field} should look like an address"
        assert value == value.lower()
    for domain in payload["domains"]:
        assert domain["slug"]
        for field, value in domain.items():
            if field == "slug":
                continue
            assert value.startswith("0x"), f"{field} should look like an address"
            assert value == value.lower()


def test_custom_output_and_quiet_mode(tmp_path):
    custom_output = tmp_path / "custom_report.json"

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--output",
            str(custom_output),
            "--quiet",
        ],
        cwd=PHASE_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    assert result.stdout.strip() == ""
    assert custom_output.exists()

    payload = json.loads(custom_output.read_text())
    assert payload["totals"]["monthlyUSD"] > 0


def test_invalid_addresses_surface_in_report(tmp_path):
    manifest_data = json.loads((PHASE_ROOT / "config" / "universal.value.manifest.json").read_text())
    manifest_data["domains"][0]["orchestrator"] = "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"

    bad_manifest = tmp_path / "bad_manifest.json"
    bad_manifest.write_text(json.dumps(manifest_data))
    bad_output = tmp_path / "bad_report.json"

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--manifest",
            str(bad_manifest),
            "--output",
            str(bad_output),
            "--quiet",
        ],
        cwd=PHASE_ROOT,
        capture_output=True,
        text=True,
    )

    payload = json.loads(bad_output.read_text())
    assert result.returncode == 1
    assert payload["domains"][0]["orchestrator"] == ZERO_ADDRESS
    assert payload["addressAudit"]["invalidCount"] == 1
    assert any("domains[0].orchestrator" in path for path in payload["addressAudit"]["invalidPaths"])
