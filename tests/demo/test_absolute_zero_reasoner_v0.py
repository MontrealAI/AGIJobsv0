"""Regression tests for the Absolute Zero Reasoner demo."""
from __future__ import annotations

import json
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[2] / "demo" / "Absolute-Zero-Reasoner-v0"
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from azr_demo.__main__ import AbsoluteZeroReasonerDemo, DEFAULT_CONFIG  # type: ignore  # noqa: E402
from azr_demo.executor import SafeExecutor, SandboxViolation  # type: ignore  # noqa: E402
from azr_demo.reward import RewardEngine  # type: ignore  # noqa: E402
from azr_demo.tasks import TaskType  # type: ignore  # noqa: E402


def test_executor_blocks_forbidden_code() -> None:
    executor = SafeExecutor()
    program = "import os\n\ndef solve(payload):\n    return 42\n"
    try:
        executor.execute(program, {})
    except SandboxViolation as exc:
        assert "forbidden" in str(exc).lower()
    else:  # pragma: no cover
        raise AssertionError("SandboxViolation expected")


def test_reward_learnability_curve() -> None:
    reward_engine = RewardEngine()
    task_type = TaskType.DEDUCTION
    # Force alternating successes to approximate 0.5 success rate.
    rewards = [
        reward_engine.compute(
            task_type=task_type,
            solver_success=success,
            economic_value=10.0,
            format_ok=True,
        ).proposer_reward
        for success in [True, False] * 5
    ]
    peak_reward = max(rewards)
    assert peak_reward > 0.95


def test_demo_runs_and_generates_payload(tmp_path: Path) -> None:
    config = json.loads(json.dumps(DEFAULT_CONFIG))
    config["runtime"] = {"iterations": 2, "tasks_per_iteration": 2}
    demo = AbsoluteZeroReasonerDemo(config)
    payload = demo.run()
    assert payload["telemetry"]["iterations"] >= 1
    assert "gmv_total" in payload["telemetry"]
    output_path = tmp_path / "report.json"
    output_path.write_text(json.dumps(payload), encoding="utf-8")
    loaded = json.loads(output_path.read_text(encoding="utf-8"))
    assert loaded["config"]["runtime"]["iterations"] == config["runtime"]["iterations"]
