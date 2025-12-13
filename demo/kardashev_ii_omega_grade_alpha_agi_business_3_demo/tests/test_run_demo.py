from __future__ import annotations

import importlib
import runpy
import sys
from pathlib import Path
from types import SimpleNamespace


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


def test_run_as_script_uses_package_main(monkeypatch):
    repo_root = Path(__file__).resolve().parents[3]

    script_path = repo_root / "demo" / "kardashev_ii_omega_grade_alpha_agi_business_3_demo" / "run_demo.py"

    captured = {}

    def fake_main(argv):
        captured["argv"] = argv

    def fake_import(name):
        assert name == "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo"
        return SimpleNamespace(main=fake_main)

    monkeypatch.setattr(importlib, "import_module", fake_import)
    monkeypatch.setattr(sys, "argv", [str(script_path)])

    runpy.run_path(str(script_path), run_name="__main__")

    assert captured["argv"] == []
    assert str(repo_root) in sys.path
