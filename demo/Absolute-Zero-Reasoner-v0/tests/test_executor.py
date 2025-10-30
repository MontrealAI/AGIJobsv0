from __future__ import annotations

import json

from absolute_zero_reasoner_demo.executor import NonDeterministicProgram, SafeExecutor, SandboxViolation


def test_executor_blocks_forbidden_import() -> None:
    executor = SafeExecutor(time_limit=1.0, memory_limit_mb=32)
    code = "import os\nprint('oops')\n"
    try:
        executor.execute(code, {})
    except SandboxViolation as exc:
        assert "forbidden" in str(exc).lower()
    else:  # pragma: no cover
        raise AssertionError("SandboxViolation expected")


def test_executor_detects_nondeterminism() -> None:
    executor = SafeExecutor(time_limit=1.0, memory_limit_mb=32)
    code = "import json\nimport sys\nprint(json.dumps(__import__('random').random()))\n"
    try:
        executor.execute_deterministic(code, {})
    except NonDeterministicProgram:
        return
    raise AssertionError("NonDeterministicProgram expected")


def test_executor_runs_deterministic_program() -> None:
    executor = SafeExecutor(time_limit=1.0, memory_limit_mb=32)
    code = "import json\nimport sys\ndata=json.loads(sys.stdin.read())\nprint(json.dumps(data['x']+1))\n"
    result = executor.execute_deterministic(code, {"x": 2})
    assert result.succeeded
    assert result.output == 3
