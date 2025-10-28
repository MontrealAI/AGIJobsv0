from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

import sys


def test_meta_agentic_demo_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    source_dir = Path(__file__).resolve().parents[1]
    working_copy = tmp_path / "Meta-Agentic-ALPHA-AGI-Jobs-v0"
    shutil.copytree(source_dir, working_copy)
    sys.path.insert(0, str(working_copy / "python"))

    try:
        from meta_agentic_alpha_demo import load_configuration, run_demo

        config_path = working_copy / "config" / "meta_agentic_scenario.yaml"
        config = load_configuration(config_path)
        outcome = run_demo(config, timeout=20.0)

        assert outcome.status.run.state == "succeeded"
        summary_path = working_copy / "storage" / "latest_run.json"
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        assert summary["state"] == "succeeded"
        assert summary["completedSteps"] == summary["totalSteps"]
        assert summary["estimatedAlphaProbability"] > 0.5

        scoreboard_path = working_copy / "storage" / "orchestrator" / "scoreboard.json"
        assert scoreboard_path.exists()
        payload = json.loads(scoreboard_path.read_text(encoding="utf-8"))
        assert isinstance(payload, dict)
    finally:
        sys.path.pop(0)
