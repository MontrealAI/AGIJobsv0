"""Tests for the Meta-Agentic α-AGI Jobs Demo V4."""

from __future__ import annotations

import json
import shutil
from importlib import import_module
from pathlib import Path

import pytest


@pytest.fixture()
def v4_working_copy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Provide an isolated copy of the demo to keep tests self-contained."""

    source_dir = Path(__file__).resolve().parents[1]
    working_copy = tmp_path / "Meta-Agentic-ALPHA-AGI-Jobs-v0"
    shutil.copytree(source_dir, working_copy)
    monkeypatch.syspath_prepend(str(working_copy / "python"))
    monkeypatch.syspath_prepend(str(working_copy / "scripts"))
    return working_copy


@pytest.fixture()
def v4_config_path(v4_working_copy: Path) -> Path:
    return v4_working_copy / "meta_agentic_alpha_v4" / "config" / "scenario.yaml"


@pytest.fixture()
def owner_controls_module(v4_working_copy: Path) -> object:
    return import_module("owner_controls")


def test_load_configuration_v4_shape(v4_config_path: Path) -> None:
    from meta_agentic_alpha_demo.v4 import load_configuration

    config = load_configuration(v4_config_path)
    assert config.scenario.title.startswith("Meta-Agentic α-AGI Jobs Demo")
    assert config.mission.alpha_goal == "sovereign-alpha-synthesis"
    assert config.control_tower.guardian_mesh.get("quorum") == 3
    assert config.alpha_pipeline.identify["anomaly_threshold"] == 0.92
    assert len(config.control_tower.console_panels) >= 3
    assert len(config.phases) >= 8
    assert "alpha_dominion_manifesto.md" in next(iter(config.attachments))


def test_run_demo_v4_creates_summary(v4_config_path: Path) -> None:
    from meta_agentic_alpha_demo.v4 import load_configuration, run_demo

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


def test_owner_controls_v4_updates(
    v4_config_path: Path, owner_controls_module: object
) -> None:
    payload = owner_controls_module.load_yaml(v4_config_path)
    owner_controls_module.apply_assignment(payload, "plan.budget.max", 950000)
    owner_controls_module.apply_assignment(
        payload,
        "unstoppable.multi_agent_mesh.quorum",
        11,
    )
    owner_controls_module.apply_assignment(
        payload,
        "control_tower.guardian_mesh.unstoppable_pause_seconds",
        30,
    )
    rendered = owner_controls_module.dump_yaml(payload)
    assert "max: 950000" in rendered
    assert "quorum: 11" in rendered
    assert "unstoppable_pause_seconds: 30" in rendered
    assert owner_controls_module.main(
        [
            "--config",
            str(v4_config_path),
            "--show",
        ]
    ) == 0
