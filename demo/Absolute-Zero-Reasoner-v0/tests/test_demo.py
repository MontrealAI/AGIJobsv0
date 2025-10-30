from __future__ import annotations

import math

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from absolute_zero_demo import AbsoluteZeroDemo, DemoConfig
from absolute_zero_demo.executor import SandboxExecutor
from absolute_zero_demo.market import MarketSimulator
from absolute_zero_demo.proposer import TaskProposer


def test_proposer_generates_tasks():
    config = DemoConfig()
    proposer = TaskProposer(config)
    tasks = proposer.generate_batch()
    assert len(tasks) == config.batch_size
    for task in tasks:
        assert "def" in task.program
        assert task.input_payload
        assert task.expected_output


def test_executor_blocks_banned_code():
    config = DemoConfig()
    executor = SandboxExecutor(config)
    program = "def exploit(payload):\n    import os\n    return 1"
    result = executor.execute(program, {"value": 1})
    assert not result.succeeded
    assert "Banned" in (result.error or "")


def test_demo_iteration_produces_positive_value():
    config = DemoConfig()
    demo = AbsoluteZeroDemo(config)
    outcome = demo.run_iteration()
    assert outcome.gross_value >= 0.0
    assert outcome.total_cost >= 0.0
    assert len(outcome.tasks) == config.batch_size
