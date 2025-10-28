"""Regression tests for the Meta-Agentic α-AGI Jobs Demo V3."""

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

from meta_agentic_alpha_demo.v3 import load_configuration, run_demo  # noqa: E402  pylint: disable=wrong-import-position

owner_controls = import_module("owner_controls")


@pytest.fixture()
def v3_config_path() -> Path:
    return (
        Path(__file__)
        .resolve()
        .parent
        .parent
        / "meta_agentic_alpha_v3"
        / "config"
        / "scenario.yaml"
    )


def test_load_configuration_v3_shape(v3_config_path: Path) -> None:
    config = load_configuration(v3_config_path)
    assert config.scenario.title.startswith("Meta-Agentic α-AGI Jobs Demo")
    assert config.mission.alpha_goal == "compound-global-alpha"
    halt_conditions = config.unstoppable.get("safety_net", {}).get("halt_conditions", [])
    assert any("guardian" in condition for condition in halt_conditions)
    assert len(config.phases) >= 7
    assert {phase.identifier for phase in config.phases} >= {
        "identify",
        "learn",
        "think",
        "design",
        "strategise",
        "govern",
        "execute-onchain",
        "feedback",
    }
    assert "meta_mission_deck.md" in next(iter(config.attachments))


def test_run_demo_v3_creates_summary(tmp_path: Path, v3_config_path: Path) -> None:
    config = load_configuration(v3_config_path)
    outcome = run_demo(config, timeout=40)
    summary_path = Path(outcome.summary_path)
    assert summary_path.exists()
    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    assert payload["state"] in {"succeeded", "failed"}
    assert 0.0 <= float(payload["alphaReadiness"]) <= 1.0
    assert 0.0 <= float(payload["alphaCompoundingIndex"]) <= 1.0
    assert len(payload["phaseScores"]) == len(config.phases)
    assert payload["mission"]["alpha_goal"] == config.mission.alpha_goal
    assert payload["unstoppable"]["multi_agent_mesh"]["quorum"] == 7
    assert Path(outcome.report_path).exists()
    assert Path(outcome.dashboard_path).exists()
    assert Path(outcome.metadata["dashboardDataPath"]).exists()


def test_owner_controls_v3_updates(tmp_path: Path, v3_config_path: Path) -> None:
    payload = owner_controls.load_yaml(v3_config_path)
    owner_controls.apply_assignment(payload, "plan.budget.max", 1200000)
    owner_controls.apply_assignment(
        payload,
        "phases[execute-onchain].step.params.job.reward",
        333000,
    )
    owner_controls.apply_assignment(
        payload,
        "mission.ica_score_target",
        0.97,
    )
    rendered = owner_controls.dump_yaml(payload)
    assert "max: 1200000" in rendered
    assert "reward: 333000" in rendered
    assert "ica_score_target: 0.97" in rendered
    assert owner_controls.main(
        [
            "--config",
            str(v3_config_path),
            "--show",
        ]
    ) == 0
