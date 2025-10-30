from __future__ import annotations

import asyncio
import json
from pathlib import Path

from agi_alpha_node_demo.orchestration.runtime import build_runtime


def _copy_config(tmp_path: Path) -> Path:
    repo_root = Path(__file__).resolve().parents[1]
    source = repo_root / "config" / "alpha_node.example.yml"
    destination = tmp_path / "alpha_node.yml"
    data = source.read_text(encoding="utf-8")
    destination.write_text(data, encoding="utf-8")
    return destination


def test_runtime_run_once(tmp_path: Path) -> None:
    config_path = _copy_config(tmp_path)
    runtime = build_runtime(config_path=str(config_path), offline=True)
    payload = asyncio.run(runtime.run_once())
    assert payload["ens"]["verified"] is True
    assert payload["stake"]["meets_threshold"] is True
    assert payload["results"], "Expected at least one job result"
    assert payload["compliance"]["total"] > 0
    log_file = Path(__file__).resolve().parents[1] / "logs" / "alpha_node_runs.jsonl"
    assert log_file.exists()
    data = json.loads(log_file.read_text(encoding="utf-8").strip().splitlines()[-1])
    assert data["rewards_total"] >= 0
