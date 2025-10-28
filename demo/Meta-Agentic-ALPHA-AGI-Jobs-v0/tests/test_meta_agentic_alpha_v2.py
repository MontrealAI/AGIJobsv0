"""Regression tests for the Meta-Agentic α-AGI Jobs Demo V2."""

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

from meta_agentic_alpha_demo.v2 import load_configuration, run_demo

owner_controls = import_module("owner_controls")


@pytest.fixture()
def v2_config_path() -> Path:
    return (
        Path(__file__)
        .resolve()
        .parent
        .parent
        / "meta_agentic_alpha_v2"
        / "config"
        / "scenario.yaml"
    )


def test_load_configuration_v2_shape(v2_config_path: Path) -> None:
    config = load_configuration(v2_config_path)
    assert config.scenario.title == "Meta-Agentic α-AGI Jobs Demo V2"
    assert config.owner["address"].startswith("0xA1FAce")
    assert len(config.phases) >= 6
    assert {phase.identifier for phase in config.phases} >= {
        "identify",
        "learn",
        "think",
        "design",
        "strategise",
        "execute-onchain",
    }
    assert "max" in config.plan.budget
    assert "alpha_masterplan.md" in next(iter(config.attachments))


def test_run_demo_v2_creates_summary(tmp_path: Path, v2_config_path: Path) -> None:
    config = load_configuration(v2_config_path)
    outcome = run_demo(config, timeout=30)
    summary_path = Path(outcome.summary_path)
    assert summary_path.exists()
    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    assert payload["state"] in {"succeeded", "failed"}
    assert 0.0 <= float(payload["alphaReadiness"]) <= 1.0
    assert len(payload["phaseScores"]) == len(config.phases)
    assert set(payload["approvals"]) == set(config.approvals)
    assert payload["scenario"]["title"] == config.scenario.title
    assert (config.base_dir / payload["__masterplanPath"]).exists()
    assert (config.base_dir / payload["__dashboardPath"]).exists()
    assert (config.base_dir / payload["__sourceSummaryPath"]).exists()
    assert "phaseScores" in json.loads(Path(outcome.metadata["dashboardDataPath"]).read_text(encoding="utf-8"))
    assert Path(outcome.report_path).exists()
    assert Path(outcome.dashboard_path).exists()


def test_owner_controls_updates_configuration(tmp_path: Path, v2_config_path: Path) -> None:
    payload = owner_controls.load_yaml(v2_config_path)
    owner_controls.apply_assignment(payload, "plan.budget.max", 600000)
    owner_controls.apply_assignment(
        payload,
        "phases[execute-onchain].step.params.job.reward",
        150000,
    )
    rendered = owner_controls.dump_yaml(payload)
    assert "max: 600000" in rendered
    assert "reward: 150000" in rendered
    assert owner_controls.main(
        [
            "--config",
            str(v2_config_path),
            "--show",
        ]
    ) == 0
