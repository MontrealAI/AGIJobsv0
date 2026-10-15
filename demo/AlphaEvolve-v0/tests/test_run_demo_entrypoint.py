from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_run_demo_script_help(tmp_path):
    env = os.environ.copy()
    env.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

    result = subprocess.run(
        [sys.executable, "run_demo.py", "--help"],
        cwd=Path(__file__).resolve().parents[1],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    assert "AlphaEvolve grand demo" in result.stdout
    assert "run" in result.stdout


def test_scripted_run_reports_modeled_scope(tmp_path):
    import json
    output = tmp_path / 'scope.json'
    result = subprocess.run([sys.executable, 'run_demo.py', 'run', '--seed', '7', '--generations', '2', '--output', str(output)], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    report = json.loads(output.read_text())
    assert report['execution_mode'] == 'local-scripted-heuristic-search'
    assert report['costs_are_modeled'] is True
    for field in ['live_provider', 'actual_chain', 'production_approved', 'settlement_approved']:
        assert report[field] is False
    assert len(report['history']) == 2
