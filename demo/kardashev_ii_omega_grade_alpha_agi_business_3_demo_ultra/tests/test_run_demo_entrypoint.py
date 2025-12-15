from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra import run_demo


def test_run_forwards_arguments(monkeypatch):
    captured = {}

    def fake_main(argv):
        captured["argv"] = argv

    run_demo.run(["launch", "--cycles", "2"], main_fn=fake_main)
    assert captured["argv"] == ["launch", "--cycles", "2"]


def test_main_module_executes_as_script(tmp_path):
    script = Path(__file__).resolve().parent.parent / "__main__.py"
    result = subprocess.run(
        [sys.executable, str(script), "--help"],
        check=True,
        capture_output=True,
        text=True,
        cwd=tmp_path,
    )
    assert "Kardashev-II Omega-Grade Ultra Mission orchestrator" in result.stdout
