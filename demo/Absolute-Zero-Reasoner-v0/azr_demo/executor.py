"""Deterministic sandbox executor tailored for the demo."""
from __future__ import annotations

import json
import os
import resource
import signal
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Tuple


_BANNED_PATTERNS: Tuple[str, ...] = (
    "import os",
    "import sys",
    "import subprocess",
    "import socket",
    "open(",
    "__import__",
)


@dataclass
class ExecutionResult:
    """Structured response from the sandbox."""

    output: Any
    stderr: str = ""
    timed_out: bool = False
    non_deterministic: bool = False


class SandboxViolation(RuntimeError):
    """Raised when unsafe code is detected."""


class SafeExecutor:
    """Small, reproducible code executor used across the demo."""

    def __init__(
        self,
        *,
        time_limit: float = 3.0,
        memory_limit_mb: int = 256,
        python_executable: str = sys.executable,
        ensure_deterministic: bool = True,
    ) -> None:
        self.time_limit = time_limit
        self.memory_limit_mb = memory_limit_mb
        self.python_executable = python_executable
        self.ensure_deterministic = ensure_deterministic

    def _check_safety(self, program: str) -> None:
        lowered = program.lower()
        for pattern in _BANNED_PATTERNS:
            if pattern in lowered:
                raise SandboxViolation(f"Forbidden pattern detected: {pattern}")

    def _run_once(self, program: str, payload: Dict[str, Any]) -> ExecutionResult:
        self._check_safety(program)
        with tempfile.TemporaryDirectory() as tmp:
            script_path = Path(tmp) / "azr_task.py"
            harness = self._compose_harness(program)
            script_path.write_text(harness, encoding="utf-8")
            input_blob = json.dumps({"payload": payload})
            env = {"PYTHONHASHSEED": "0"}
            env.update({k: v for k, v in os.environ.items() if k.startswith("AGI")})
            preexec_fn = self._create_resource_limiter()
            try:
                completed = subprocess.run(
                    [self.python_executable, "-I", str(script_path)],
                    input=input_blob.encode("utf-8"),
                    capture_output=True,
                    timeout=self.time_limit,
                    env=env,
                    preexec_fn=preexec_fn,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                return ExecutionResult(output=None, stderr="timeout", timed_out=True)
            stderr = completed.stderr.decode("utf-8")
            if completed.returncode != 0:
                raise RuntimeError(stderr.strip())
            data = completed.stdout.decode("utf-8").strip()
            output = json.loads(data)["result"] if data else None
            return ExecutionResult(output=output, stderr=stderr)

    def _compose_harness(self, program: str) -> str:
        harness = f"""
import json
import sys
from typing import Any

{program}

def _entry() -> None:
    request = json.load(sys.stdin)
    payload = request.get("payload")
    result = solve(payload)
    json.dump({{"result": result}}, sys.stdout)


if __name__ == "__main__":
    _entry()
""".strip()
        return harness

    def _create_resource_limiter(self):
        soft_bytes = int(self.memory_limit_mb * 1024 * 1024)

        cpu_seconds = max(1, int(self.time_limit))

        def _limit() -> None:
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
            resource.setrlimit(resource.RLIMIT_AS, (soft_bytes, soft_bytes))
            signal.signal(signal.SIGXCPU, signal.SIG_DFL)

        return _limit

    def execute(self, program: str, payload: Dict[str, Any]) -> ExecutionResult:
        """Execute ``program`` with ``payload`` inside the sandbox."""

        first = self._run_once(program, payload)
        if not self.ensure_deterministic or first.timed_out:
            return first
        second = self._run_once(program, payload)
        if first.output != second.output:
            return ExecutionResult(
                output=None,
                stderr="non-deterministic output",
                non_deterministic=True,
            )
        return first


__all__ = ["SafeExecutor", "SandboxViolation", "ExecutionResult"]
