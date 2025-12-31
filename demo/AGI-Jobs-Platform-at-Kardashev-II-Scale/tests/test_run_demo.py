from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
import shutil

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEMO_ROOT = PROJECT_ROOT / "demo" / "AGI-Jobs-Platform-at-Kardashev-II-Scale"
PYTHON_ENTRYPOINT = DEMO_ROOT / "run_demo.py"
NODE_ENTRYPOINT = DEMO_ROOT / "run-demo.cjs"


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
    assert "Sentient welfare equilibrium" in result.stdout


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_check_mode_with_default_output_dir() -> None:
    """The wrapper should accept the default output directory in check mode."""

    result = subprocess.run(
        [sys.executable, str(PYTHON_ENTRYPOINT), "--check"],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "validated (check mode)" in result.stdout


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_check_mode_with_config_root(tmp_path: Path) -> None:
    """The wrapper should accept a config root override and still validate."""

    result = subprocess.run(
        [
            sys.executable,
            str(PYTHON_ENTRYPOINT),
            "--output-dir",
            str(tmp_path),
            "--config-root",
            str(DEMO_ROOT),
            "--check",
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "validated (check mode)" in result.stdout


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
    stability_ledger = tmp_path / "kardashev-stability-ledger.json"
    equilibrium_ledger = tmp_path / "kardashev-equilibrium-ledger.json"
    owner_proof = tmp_path / "kardashev-owner-proof.json"
    task_hierarchy = tmp_path / "kardashev-task-hierarchy.mmd"
    mermaid_map = tmp_path / "kardashev-mermaid.mmd"
    dyson_diagram = tmp_path / "kardashev-dyson.mmd"
    diagrams_inline = tmp_path / "kardashev-diagrams.inline.js"
    action_path = tmp_path / "kardashev-action-path.md"
    offline_index = tmp_path / "index.html"
    offline_ui = tmp_path / "ui"
    offline_css = offline_ui / "style.css"
    offline_dashboard = offline_ui / "dashboard.js"

    for path in (
        report,
        governance,
        telemetry,
        stability_ledger,
        equilibrium_ledger,
        owner_proof,
        task_hierarchy,
        mermaid_map,
        dyson_diagram,
        diagrams_inline,
        action_path,
        offline_index,
        offline_css,
        offline_dashboard,
    ):
        assert path.exists(), f"expected artefact missing: {path}"

    offline_index_contents = offline_index.read_text()
    assert 'window.__KARDASHEV_ASSET_BASE__ = ".";' in offline_index_contents
    assert 'src="./kardashev-telemetry.inline.js"' in offline_index_contents

    action_path_contents = action_path.read_text()
    assert "Kardashev II Action Path" in action_path_contents
    assert "Action path" in action_path_contents

    telemetry_payload = json.loads(telemetry.read_text())
    assert telemetry_payload.get("energyMonteCarlo", {}).get("withinTolerance") is True
    assert telemetry_payload.get("dominanceScore")
    assert telemetry_payload.get("dominance", {}).get("score") == telemetry_payload["dominanceScore"]
    assert telemetry_payload.get("dominance", {}).get("monthlyValueUSD") > 0
    assert 0 <= telemetry_payload.get("dominance", {}).get("averageResilience") <= 1

    energy = telemetry_payload["energyMonteCarlo"]
    assert energy["maintainsBuffer"] is True
    assert energy["freeEnergyMarginGw"] > 0
    assert 0 < energy["freeEnergyMarginPct"] <= 1
    assert energy["runwayHours"] > 0
    assert energy["grossRunwayHours"] >= energy["runwayHours"]
    assert energy["usableFreeEnergyGw"] >= 0
    assert energy["runwayGapHours"] >= 0
    assert energy["runwayGapGwh"] >= 0
    assert energy["runwayGapGj"] >= 0
    assert energy["gibbsFreeEnergyGj"] > 0
    assert 0 <= energy["hamiltonianStability"] <= 1
    assert energy["entropyMargin"] > 0
    assert 0 <= energy["gameTheorySlack"] <= 1

    allocation = telemetry_payload["allocationPolicy"]
    assert allocation["allocationEntropy"] >= 0
    assert 0 < allocation["fairnessIndex"] <= 1
    assert allocation["gibbsPotential"] <= 0
    assert 0 <= allocation["strategyStability"] <= 1
    assert 0 <= allocation["deviationIncentive"] <= 1
    assert 0 <= allocation["jainIndex"] <= 1
    assert allocation["concentrationIndex"] <= allocation["diversificationTarget"]
    assert allocation["unallocatedGw"] >= 0
    assert allocation["capacityConstraintCount"] >= 0
    assert isinstance(allocation["capacityConstrained"], bool)

    for shard_allocation in allocation["allocations"]:
        assert 0 <= shard_allocation["effectiveWeight"] <= 1
        if shard_allocation["capacityGw"] is not None:
            assert shard_allocation["recommendedGw"] <= shard_allocation["capacityGw"] + 1e-6

    sentient = telemetry_payload["sentientWelfare"]
    assert sentient["totalAgents"] > 0
    assert sentient["federationCount"] > 0
    assert sentient["freeEnergyPerAgentGj"] >= 0
    assert 0 <= sentient["cooperationIndex"] <= 1
    assert 0 <= sentient["inequalityIndex"] <= 1
    assert sentient["payoffCoefficient"] >= 0
    assert 0 <= sentient["coalitionStability"] <= 1
    assert 0 <= sentient["paretoSlack"] <= 1
    assert 0 <= sentient["equilibriumScore"] <= 1
    assert 0 <= sentient["welfarePotential"] <= 1
    assert 0 <= sentient["collectiveActionPotential"] <= 1

    federation_equity = telemetry_payload["federationEquity"]
    assert federation_equity["totalAvailableGw"] > 0
    assert federation_equity["totalAgents"] > 0
    assert federation_equity["totalFreeEnergyGj"] >= 0
    assert 0 <= federation_equity["inequalityIndex"] <= 1
    assert 0 <= federation_equity["coalitionStability"] <= 1
    assert 0 <= federation_equity["equityScore"] <= 1
    assert federation_equity["entries"]
    for entry in federation_equity["entries"]:
        assert entry["federation"]
        assert entry["agents"] >= 0
        assert entry["availableGw"] >= 0
        assert 0 <= entry["energySharePct"] <= 1
        assert 0 <= entry["agentSharePct"] <= 1
        assert entry["freeEnergyPerAgentGj"] >= 0
        assert -1 <= entry["equityGapPct"] <= 1

    mission_thermo = telemetry_payload["missionThermodynamics"]
    assert 0 <= mission_thermo["hamiltonianLoad"] <= 1
    assert 0 <= mission_thermo["hamiltonianStability"] <= 1
    assert 0 <= mission_thermo["freeEnergyHeadroomPct"] <= 1
    assert mission_thermo["actionQueue"]

    ledger_payload = json.loads(stability_ledger.read_text())
    assert ledger_payload["confidence"]["compositeScore"] >= 0
    assert isinstance(ledger_payload["checks"], list)
    assert "summary" in ledger_payload["confidence"]

    owner_payload = json.loads(owner_proof.read_text())
    assert owner_payload["verification"]["unstoppableScore"] >= 0
    assert owner_payload["secondaryVerification"]["matchesPrimaryScore"] is True
    assert owner_payload["hashes"]["transactionSet"].startswith("sha256:")

    equilibrium_payload = json.loads(equilibrium_ledger.read_text())
    assert equilibrium_payload["overallScore"] >= 0
    assert equilibrium_payload["components"]["energy"]["freeEnergyMarginPct"] > 0
    assert equilibrium_payload["components"]["energy"]["usableFreeEnergyGw"] >= 0
    assert (
        equilibrium_payload["components"]["energy"]["grossRunwayHours"]
        >= equilibrium_payload["components"]["energy"]["runwayHours"]
    )
    assert 0 <= equilibrium_payload["components"]["allocation"]["strategyStability"] <= 1
    assert 0 <= equilibrium_payload["components"]["welfare"]["coalitionStability"] <= 1
    assert equilibrium_payload["components"]["compute"]["averageAvailabilityPct"] >= 0
    assert 0 <= equilibrium_payload["components"]["logistics"]["nashWelfare"] <= 1
    assert 0 <= equilibrium_payload["gameTheory"]["logisticsNashWelfare"] <= 1
    assert equilibrium_payload["pathways"]
    assert equilibrium_payload["pathways"][0]["title"]
    assert equilibrium_payload["actionPath"]
    assert equilibrium_payload["actionPath"][0]["title"]
    assert equilibrium_payload["actionPath"][0]["target"]
    priorities = [step["priorityScore"] for step in equilibrium_payload["actionPath"]]
    assert all(0 <= priority <= 1 for priority in priorities)
    assert priorities == sorted(priorities, reverse=True)
    runway_adjustment = equilibrium_payload["thermodynamics"]["runwayAdjustment"]
    assert runway_adjustment["targetHours"] >= 0
    assert runway_adjustment["totalReserveBoostGw"] >= 0
    assert isinstance(runway_adjustment["applied"], bool)
    assert isinstance(runway_adjustment["perFeedBoosts"], list)

    telemetry_energy = telemetry_payload["energy"]
    assert telemetry_energy["utilisationPct"] > 0
    assert telemetry_energy["models"]["regionalSumGw"] > 0
    assert telemetry_energy["monteCarlo"]["withinTolerance"] is True
    assert telemetry_energy["liveFeeds"]["feeds"]
    assert telemetry_payload["missionDirectives"]["ownerPowers"]
    assert telemetry_payload["missionLattice"]["programmes"]


@pytest.mark.skipif(shutil.which("node") is None, reason="Node is required to run the demo script")
@pytest.mark.skipif(not NODE_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_accepts_file_output_dir(tmp_path: Path) -> None:
    """The Node demo should accept file:// output directories for local workflows."""

    output_dir = tmp_path / "file-output"
    output_uri = output_dir.as_uri()
    env = os.environ.copy()
    env["OUTPUT_DIR"] = output_uri

    result = subprocess.run(
        ["node", str(NODE_ENTRYPOINT)],
        capture_output=True,
        text=True,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "kardashev-report.md").exists()


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_rejects_invalid_energy_feed(tmp_path: Path) -> None:
    """Invalid energy configs should fail fast with a helpful error."""

    energy_config = json.loads((DEMO_ROOT / "config" / "energy-feeds.json").read_text())
    energy_config["feeds"][0]["nominalMw"] = -1  # provoke validation failure
    invalid_energy = tmp_path / "energy-feeds.json"
    invalid_energy.write_text(json.dumps(energy_config))

    env = os.environ.copy()
    env.update({"KARDASHEV_ENERGY_FEEDS_PATH": str(invalid_energy)})

    result = subprocess.run(
        [sys.executable, str(PYTHON_ENTRYPOINT), "--output-dir", str(tmp_path), "--check"],
        capture_output=True,
        text=True,
        env=env,
    )

    combined_output = (result.stdout + result.stderr).lower()
    assert result.returncode != 0
    assert "configuration validation failed" in combined_output
    assert "energy feed" in combined_output


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_rejects_excess_buffer(tmp_path: Path) -> None:
    """Energy feed buffers should not exceed nominal capacity."""

    energy_config = json.loads((DEMO_ROOT / "config" / "energy-feeds.json").read_text())
    energy_config["feeds"][0]["bufferMw"] = energy_config["feeds"][0]["nominalMw"] + 1
    invalid_energy = tmp_path / "energy-feeds.json"
    invalid_energy.write_text(json.dumps(energy_config))

    env = os.environ.copy()
    env.update({"KARDASHEV_ENERGY_FEEDS_PATH": str(invalid_energy)})

    result = subprocess.run(
        [sys.executable, str(PYTHON_ENTRYPOINT), "--output-dir", str(tmp_path), "--check"],
        capture_output=True,
        text=True,
        env=env,
    )

    combined_output = (result.stdout + result.stderr).lower()
    assert result.returncode != 0
    assert "configuration validation failed" in combined_output
    assert "buffermw must not exceed nominalmw" in combined_output


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_rejects_invalid_drift_alert(tmp_path: Path) -> None:
    """Invalid driftAlertPct values should fail validation."""

    energy_config = json.loads((DEMO_ROOT / "config" / "energy-feeds.json").read_text())
    energy_config["driftAlertPct"] = -1
    invalid_energy = tmp_path / "energy-feeds.json"
    invalid_energy.write_text(json.dumps(energy_config))

    env = os.environ.copy()
    env.update({"KARDASHEV_ENERGY_FEEDS_PATH": str(invalid_energy)})

    result = subprocess.run(
        [sys.executable, str(PYTHON_ENTRYPOINT), "--output-dir", str(tmp_path), "--check"],
        capture_output=True,
        text=True,
        env=env,
    )

    combined_output = (result.stdout + result.stderr).lower()
    assert result.returncode != 0
    assert "configuration validation failed" in combined_output
    assert "driftalertpct" in combined_output


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_allows_default_tolerance(tmp_path: Path) -> None:
    """Missing tolerancePct should fall back to defaults instead of failing validation."""

    energy_config = json.loads((DEMO_ROOT / "config" / "energy-feeds.json").read_text())
    energy_config.pop("tolerancePct", None)
    energy_config.pop("driftAlertPct", None)
    relaxed_energy = tmp_path / "energy-feeds.json"
    relaxed_energy.write_text(json.dumps(energy_config))

    env = os.environ.copy()
    env.update({"KARDASHEV_ENERGY_FEEDS_PATH": str(relaxed_energy)})

    result = subprocess.run(
        [sys.executable, str(PYTHON_ENTRYPOINT), "--output-dir", str(tmp_path), "--check"],
        capture_output=True,
        text=True,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert "validated (check mode)" in result.stdout


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_energy_feed_resolution_prefers_federation_slug(tmp_path: Path) -> None:
    """Allocation enrichment should match feeds by federationSlug even if region names drift."""

    energy_config = json.loads((DEMO_ROOT / "config" / "energy-feeds.json").read_text())
    energy_config["feeds"][0]["region"] = "terra-grid"
    custom_energy = tmp_path / "energy-feeds.json"
    custom_energy.write_text(json.dumps(energy_config))

    env = os.environ.copy()
    env.update({"KARDASHEV_ENERGY_FEEDS_PATH": str(custom_energy)})

    result = subprocess.run(
        [sys.executable, str(PYTHON_ENTRYPOINT), "--output-dir", str(tmp_path)],
        capture_output=True,
        text=True,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    telemetry_payload = json.loads((tmp_path / "kardashev-telemetry.json").read_text())
    allocations = telemetry_payload["allocationPolicy"]["allocations"]
    earth_allocation = next(entry for entry in allocations if entry["shardId"] == "earth")
    assert earth_allocation["renewablePct"] is not None
    assert earth_allocation["deltaGw"] is not None


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_requires_energy_coverage(tmp_path: Path) -> None:
    """Every shard must map to a matching energy feed."""

    energy_config = json.loads((DEMO_ROOT / "config" / "energy-feeds.json").read_text())
    energy_config["feeds"][0]["federationSlug"] = "luna"
    energy_config["feeds"][0]["region"] = "luna-grid"
    invalid_energy = tmp_path / "energy-feeds.json"
    invalid_energy.write_text(json.dumps(energy_config))

    env = os.environ.copy()
    env.update({"KARDASHEV_ENERGY_FEEDS_PATH": str(invalid_energy)})

    result = subprocess.run(
        [sys.executable, str(PYTHON_ENTRYPOINT), "--output-dir", str(tmp_path), "--check"],
        capture_output=True,
        text=True,
        env=env,
    )

    combined_output = (result.stdout + result.stderr).lower()
    assert result.returncode != 0
    assert "energy feeds missing coverage" in combined_output
