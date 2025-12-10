from __future__ import annotations

import sys
from pathlib import Path

DEMO_ROOT = Path(__file__).resolve().parents[1]
if str(DEMO_ROOT) not in sys.path:
    sys.path.insert(0, str(DEMO_ROOT))

from azr_demo.__main__ import AbsoluteZeroReasonerDemo, load_config


class _StepClock:
    def __init__(self, steps: list[float]) -> None:
        self._steps = steps
        self._last = steps[-1] if steps else 0.0

    def __call__(self) -> float:
        if self._steps:
            self._last = self._steps.pop(0)
        return self._last


def test_demo_respects_wall_clock(monkeypatch):
    config = load_config(None)
    config["runtime"]["iterations"] = 5
    config["runtime"]["tasks_per_iteration"] = 2
    clock = _StepClock([0.0, 0.0, 0.05, 0.11, 0.11])
    demo = AbsoluteZeroReasonerDemo(
        config,
        max_seconds=0.1,
        progress_interval=1,
        verbose=False,
        clock=clock,
    )

    def _fast_solve(self, task, temperature: float = 1.0):
        return {"answer": task.expected_output, "program": task.program}, True

    monkeypatch.setattr(demo.solver, "solve", _fast_solve.__get__(demo.solver))
    payload = demo.run()

    # The wall-clock guard should stop the loop before consuming all iterations.
    assert payload["telemetry"]["iterations"] < 5
    assert payload["guardrails"]["paused"] >= 1.0


def test_progress_logging_can_be_quiet(monkeypatch, capsys):
    config = load_config(None)
    config["runtime"]["iterations"] = 1
    config["runtime"]["tasks_per_iteration"] = 1
    demo = AbsoluteZeroReasonerDemo(
        config,
        max_seconds=1.0,
        progress_interval=1,
        verbose=False,
    )

    def _fast_solve(self, task, temperature: float = 1.0):
        return {"answer": task.expected_output, "program": task.program}, True

    monkeypatch.setattr(demo.solver, "solve", _fast_solve.__get__(demo.solver))
    demo.run()

    captured = capsys.readouterr()
    assert captured.out == ""
