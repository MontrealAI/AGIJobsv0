from __future__ import annotations

import importlib
from pathlib import Path


def test_run_forwards_arguments(monkeypatch):
    repo_root = Path(__file__).resolve().parents[3]
    monkeypatch.syspath_prepend(str(repo_root))

    captured = {}

    def fake_main(argv):
        captured["argv"] = argv

    module = importlib.import_module(
        "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.run_demo"
    )
    module.run(["--cycles", "2", "--no-sim"], main_fn=fake_main)

    assert captured["argv"] == ["--cycles", "2", "--no-sim"]
