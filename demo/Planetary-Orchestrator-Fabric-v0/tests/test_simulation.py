"""Integration tests for the Planetary Orchestrator Fabric demo."""
from __future__ import annotations

import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from planetary_fabric.simulation import run_high_load_blocking


def test_high_load_balance(tmp_path: Path) -> None:
    result = run_high_load_blocking(tmp_path, job_count=3_000, kill_and_resume=False)
    assert result.completion_rate >= 0.98
    assert result.max_depth_delta() < 250
    assert result.reassigned_jobs / result.total_jobs <= 0.025


def test_mid_run_checkpoint_recovery(tmp_path: Path) -> None:
    result = run_high_load_blocking(tmp_path, job_count=3_000, kill_and_resume=True)
    assert result.completion_rate >= 0.98
    assert result.reassigned_jobs / result.total_jobs <= 0.045
    assert result.max_depth_delta() < 300
