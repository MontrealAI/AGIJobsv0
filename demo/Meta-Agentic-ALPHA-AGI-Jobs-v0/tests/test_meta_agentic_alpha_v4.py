"""Tests for the Meta-Agentic α-AGI Jobs Demo V4."""

from __future__ import annotations

import json
import sys
from importlib import import_module
from pathlib import Path

import pytest


def _ensure_paths() -> None:
    tests_dir = Path(__file__).resolve().parent
    demo_root = tests_dir.parent
    python_dir = demo_root / "python"
    scripts_dir = demo_root / "scripts"
    repo_root = demo_root.parent.parent
    for candidate in (python_dir, repo_root, scripts_dir):
        if str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))


_ensure_paths()

from meta_agentic_alpha_demo.v4 import load_configuration, run_demo  # noqa: E402  pylint: disable=wrong-import-position

owner_controls = import_module("owner_controls")


@pytest.fixture()
def v4_config_path() -> Path:
    return (
        Path(__file__)
        .resolve()
        .parent
        .parent
        / "meta_agentic_alpha_v4"
        / "config"
        / "scenario.yaml"
    )


def test_load_configuration_v4_shape(v4_config_path: Path) -> None:
    config = load_configuration(v4_config_path)
    assert config.scenario.title.startswith("Meta-Agentic α-AGI Jobs Demo")
    assert config.mission.alpha_goal == "sovereign-alpha-synthesis"
    assert config.control_tower.guardian_mesh.get("quorum") == 3
    assert config.alpha_pipeline.identify["anomaly_threshold"] == 0.92
    assert len(config.control_tower.console_panels) >= 3
    assert len(config.phases) >= 8
    assert "alpha_dominion_manifesto.md" in next(iter(config.attachments))


def test_run_demo_v4_creates_summary(tmp_path: Path, v4_config_path: Path) -> None:
    config = load_configuration(v4_config_path)
    outcome = run_demo(config, timeout=60)
    summary_path = Path(outcome.summary_path)
    assert summary_path.exists()
    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    assert payload["state"] in {"succeeded", "failed"}
    assert 0.0 <= float(payload["alphaReadiness"]) <= 1.0
    assert 0.0 <= float(payload["alphaDominance"]) <= 1.0
    assert 0.0 <= float(payload["governanceAlignment"]) <= 1.0
    assert len(payload["phaseScores"]) == len(config.phases)
    assert payload["controlTower"]["guardianMesh"]["quorum"] == 3
    assert Path(outcome.report_path).exists()
    assert Path(outcome.dashboard_path).exists()
    assert Path(outcome.metadata["dashboardDataPath"]).exists()


def test_owner_controls_v4_updates(tmp_path: Path, v4_config_path: Path) -> None:
    payload = owner_controls.load_yaml(v4_config_path)
    owner_controls.apply_assignment(payload, "plan.budget.max", 950000)
    owner_controls.apply_assignment(
        payload,
        "unstoppable.multi_agent_mesh.quorum",
        11,
    )
    owner_controls.apply_assignment(
        payload,
        "control_tower.guardian_mesh.unstoppable_pause_seconds",
        30,
    )
    rendered = owner_controls.dump_yaml(payload)
    assert "max: 950000" in rendered
    assert "quorum: 11" in rendered
    assert "unstoppable_pause_seconds: 30" in rendered
    assert owner_controls.main(
        [
            "--config",
            str(v4_config_path),
            "--show",
        ]
    ) == 0
