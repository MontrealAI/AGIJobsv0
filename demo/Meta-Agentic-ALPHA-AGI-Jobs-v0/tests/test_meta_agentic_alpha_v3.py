"""Regression tests for the Meta-Agentic α-AGI Jobs Demo V3."""

from __future__ import annotations

import json
import shutil
from importlib import import_module
from pathlib import Path

import pytest


@pytest.fixture()
def v3_working_copy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Provide an isolated copy of the demo to avoid polluting the repo checkout."""

    source_dir = Path(__file__).resolve().parents[1]
    working_copy = tmp_path / "Meta-Agentic-ALPHA-AGI-Jobs-v0"
    shutil.copytree(source_dir, working_copy)
    monkeypatch.syspath_prepend(str(working_copy / "python"))
    monkeypatch.syspath_prepend(str(working_copy / "scripts"))
    return working_copy


@pytest.fixture()
def v3_config_path(v3_working_copy: Path) -> Path:
    return v3_working_copy / "meta_agentic_alpha_v3" / "config" / "scenario.yaml"


@pytest.fixture()
def owner_controls_module(v3_working_copy: Path) -> object:
    return import_module("owner_controls")


def test_load_configuration_v3_shape(v3_config_path: Path) -> None:
    from meta_agentic_alpha_demo.v3 import load_configuration

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


def test_run_demo_v3_creates_summary(v3_config_path: Path) -> None:
    from meta_agentic_alpha_demo.v3 import load_configuration, run_demo

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


def test_owner_controls_v3_updates(
    v3_config_path: Path, owner_controls_module: object
) -> None:
    payload = owner_controls_module.load_yaml(v3_config_path)
    owner_controls_module.apply_assignment(payload, "plan.budget.max", 1200000)
    owner_controls_module.apply_assignment(
        payload,
        "phases[execute-onchain].step.params.job.reward",
        333000,
    )
    owner_controls_module.apply_assignment(
        payload,
        "mission.ica_score_target",
        0.97,
    )
    rendered = owner_controls_module.dump_yaml(payload)
    assert "max: 1200000" in rendered
    assert "reward: 333000" in rendered
    assert "ica_score_target: 0.97" in rendered
    assert owner_controls_module.main(
        [
            "--config",
            str(v3_config_path),
            "--show",
        ]
    ) == 0
