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
