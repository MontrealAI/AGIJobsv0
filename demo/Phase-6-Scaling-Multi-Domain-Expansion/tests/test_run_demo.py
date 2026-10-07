from __future__ import annotations

from importlib import util
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "run_demo.py"
spec = util.spec_from_file_location("phase6_run_demo", MODULE_PATH)
if spec is None or spec.loader is None:  # pragma: no cover - defensive guard
    raise RuntimeError("Unable to load run_demo module for Phase 6 demo")
run_demo = util.module_from_spec(spec)
spec.loader.exec_module(run_demo)


def test_build_command_includes_ts_runner():
    command = run_demo.build_command(["--config", "custom.json"])
    assert command[:4] == [
        "node",
        str(run_demo.TS_NODE_PATH),
        "--compiler-options",
        run_demo.TS_NODE_OPTS,
    ]
    assert command[4].endswith("scripts/run-phase6-demo.ts")
    assert command[-2:] == ["--config", "custom.json"]


def test_main_invokes_executor(monkeypatch):
    captured = {}

    def fake_execute(command):
        captured["command"] = command
        return 7

    monkeypatch.setattr(run_demo, "_execute", fake_execute)

    exit_code = run_demo.main(["--json", "-"])

    assert exit_code == 7
    assert captured["command"][4].endswith("scripts/run-phase6-demo.ts")
    assert captured["command"][-2:] == ["--json", "-"]


def test_separator_and_paths_work_outside_repository(monkeypatch, tmp_path):
    captured = {}
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(run_demo, "_execute", lambda command: captured.setdefault("command", command) and 0)
    assert run_demo.main(["--", "--config", "custom.json", "--json=report=1.json"]) == 0
    assert captured["command"][-3:] == [
        "--config", str(tmp_path / "custom.json"), f"--json={tmp_path / 'report=1.json'}"
    ]


def test_execute_uses_repository_and_propagates_failure(monkeypatch):
    captured = {}
    monkeypatch.setattr(run_demo.shutil, "which", lambda _: "/usr/bin/node")
    monkeypatch.setattr(run_demo.Path, "is_file", lambda _: True)
    def fake_run(command, **kwargs):
        captured.update(kwargs)
        return type("Result", (), {"returncode": 23})()
    monkeypatch.setattr(run_demo.subprocess, "run", fake_run)
    assert run_demo._execute(run_demo.build_command([])) == 23
    assert captured == {"check": False, "cwd": run_demo.REPO_ROOT}


def test_missing_dependencies_do_not_download_or_execute(monkeypatch, capsys):
    monkeypatch.setattr(run_demo.Path, "is_file", lambda _: False)
    monkeypatch.setattr(run_demo.subprocess, "run", lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("must not execute")))
    assert run_demo._execute(run_demo.build_command([])) == 2
    assert "npm ci" in capsys.readouterr().err
