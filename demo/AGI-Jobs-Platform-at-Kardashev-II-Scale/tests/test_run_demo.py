from __future__ import annotations

import importlib.util
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


def _load_run_demo_module():
    spec = importlib.util.spec_from_file_location("kardashev_run_demo", PYTHON_ENTRYPOINT)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load Kardashev II demo wrapper module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


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


def test_normalize_output_dir_handles_unc_file_url() -> None:
    """UNC-style file URLs should retain their host segment."""

    module = _load_run_demo_module()
    output_dir = module._normalize_output_dir("file://nebula/share/telemetry")
    assert output_dir == Path("//nebula/share/telemetry")


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
def test_run_demo_check_mode_with_config_dir(tmp_path: Path) -> None:
    """The wrapper should accept a direct config directory as the config root."""

    config_dir = tmp_path / "config"
    config_dir.mkdir(parents=True)
    for filename in (
        "fabric.json",
        "energy-feeds.json",
        "kardashev-ii.manifest.json",
        "task-lattice.json",
    ):
        shutil.copy(DEMO_ROOT / "config" / filename, config_dir / filename)

    result = subprocess.run(
        [
            sys.executable,
            str(PYTHON_ENTRYPOINT),
            "--output-dir",
            str(tmp_path),
            "--config-root",
            str(config_dir),
            "--check",
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "validated (check mode)" in result.stdout


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_accepts_zero_latency_shards(tmp_path: Path) -> None:
    """The demo should allow local shards that declare zero latency."""

    config_dir = tmp_path / "config"
    config_dir.mkdir(parents=True)

    for filename in (
        "fabric.json",
        "energy-feeds.json",
        "kardashev-ii.manifest.json",
        "task-lattice.json",
    ):
        shutil.copy(DEMO_ROOT / "config" / filename, config_dir / filename)

    fabric_path = config_dir / "fabric.json"
    fabric_payload = json.loads(fabric_path.read_text())
    fabric_payload["shards"][0]["latencyMs"] = 0
    fabric_path.write_text(json.dumps(fabric_payload, indent=2))

    result = subprocess.run(
        [
            sys.executable,
            str(PYTHON_ENTRYPOINT),
            "--output-dir",
            str(tmp_path / "output"),
            "--config-root",
            str(tmp_path),
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


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_rejects_duplicate_energy_regions(tmp_path: Path) -> None:
    """Energy feeds must not reuse region identifiers."""

    energy_config = json.loads((DEMO_ROOT / "config" / "energy-feeds.json").read_text())
    energy_config["feeds"][1]["region"] = energy_config["feeds"][0]["region"]
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
    assert "duplicated" in combined_output
    assert "region" in combined_output


@pytest.mark.skipif(not NODE_ENTRYPOINT.exists(), reason="Node demo entrypoint is missing")
def test_run_demo_with_tilde_output_dir(tmp_path: Path) -> None:
    """The Node entrypoint should expand tilde paths to the HOME directory."""

    fake_home = tmp_path / "home"
    output_dir = fake_home / "k2-output"
    fake_home.mkdir(parents=True)

    result = subprocess.run(
        ["node", str(NODE_ENTRYPOINT), "--output-dir", "~/k2-output"],
        capture_output=True,
        text=True,
        env={**os.environ, "HOME": str(fake_home)},
    )

    assert result.returncode == 0, result.stderr
    assert (output_dir / "kardashev-report.md").exists()


@pytest.mark.skipif(not PYTHON_ENTRYPOINT.exists(), reason="Demo entrypoint is missing")
def test_run_demo_rejects_duplicate_federation_slugs(tmp_path: Path) -> None:
    """Energy feeds must not reuse federation slug identifiers."""

    energy_config = json.loads((DEMO_ROOT / "config" / "energy-feeds.json").read_text())
    energy_config["feeds"][1]["federationSlug"] = energy_config["feeds"][0]["federationSlug"]
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
    assert "duplicated" in combined_output
    assert "federationslug" in combined_output
