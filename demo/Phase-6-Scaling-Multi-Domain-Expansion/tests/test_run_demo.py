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
        "npx",
        "ts-node",
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
