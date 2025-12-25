from __future__ import annotations

import argparse
import importlib
import os
import runpy
import subprocess
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
        "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme.run_demo"
    )
    module.run(["--cycles", "3", "--disable_simulation"], main_fn=fake_main)

    assert captured["argv"] == ["--cycles", "3", "--disable_simulation"]
    assert str(repo_root) in sys.path


def test_run_parses_cli_arguments_when_using_package_entrypoint(monkeypatch):
    repo_root = Path(__file__).resolve().parents[3]
    monkeypatch.syspath_prepend(str(repo_root))

    captured = {}

    def fake_main(namespace: argparse.Namespace):
        captured["args"] = namespace

    def fake_parser_builder():
        parser = argparse.ArgumentParser()
        parser.add_argument("--cycles", type=int, default=0)
        return parser

    package = SimpleNamespace(main=fake_main, run_from_cli=fake_main, build_arg_parser=fake_parser_builder)

    real_import_module = importlib.import_module

    def fake_import(name):
        if name == "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme":
            return package
        return real_import_module(name)

    monkeypatch.setattr(importlib, "import_module", fake_import)

    module = importlib.import_module(
        "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme.run_demo"
    )
    module.run(["--cycles", "7"])

    assert isinstance(captured["args"], argparse.Namespace)
    assert captured["args"].cycles == 7
    assert str(repo_root) in sys.path


def test_run_as_script_uses_package_main(monkeypatch):
    repo_root = Path(__file__).resolve().parents[3]
    script_path = (
        repo_root / "demo" / "kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme" / "run_demo.py"
    )

    captured = {}

    def fake_main(argv):
        captured["argv"] = argv

    real_import_module = importlib.import_module

    def fake_import(name):
        if name == "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme":
            return SimpleNamespace(main=fake_main)
        return real_import_module(name)

    monkeypatch.setattr(importlib, "import_module", fake_import)
    monkeypatch.setattr(sys, "argv", [str(script_path)])

    module = importlib.import_module(
        "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme.run_demo"
    )
    runpy.run_path(str(script_path), run_name="__main__")

    assert captured["argv"] == module.DEFAULT_DEMO_ARGS
    assert str(repo_root) in sys.path


def test_module_entrypoint_invokable():
    repo_root = Path(__file__).resolve().parents[3]
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(
        segment for segment in [str(repo_root), env.get("PYTHONPATH", "")] if segment
    )

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme",
            "--help",
        ],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )

    assert result.returncode == 0
    assert "Supreme Omega-grade" in result.stdout
