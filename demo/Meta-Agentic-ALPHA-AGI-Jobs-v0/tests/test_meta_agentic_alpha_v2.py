"""Regression tests for the Meta-Agentic α-AGI Jobs Demo V2."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest


def _ensure_paths() -> None:
    tests_dir = Path(__file__).resolve().parent
    demo_root = tests_dir.parent
    python_dir = demo_root / "python"
    repo_root = demo_root.parent.parent
    for candidate in (python_dir, repo_root):
        if str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))


_ensure_paths()

from meta_agentic_alpha_demo.v2 import load_configuration, run_demo


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
