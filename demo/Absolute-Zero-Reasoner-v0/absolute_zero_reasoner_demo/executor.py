from __future__ import annotations

import contextlib
import json
import os
import pathlib
import signal
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from typing import Any, List, Sequence


BANNED_TOKENS: Sequence[str] = (
    "import os",
    "import subprocess",
    "import socket",
    "import shutil",
    "open(",
    "exec(",
    "eval(",
    "__import__(\"os\")",
    "__import__(\"subprocess\")",
    "from os",
    "from subprocess",
    "from socket",
    "from shutil",
)


@dataclass
class ExecutionResult:
    output: Any
    stderr: str
    return_code: int
    duration_seconds: float

    @property
    def succeeded(self) -> bool:
        return self.return_code == 0 and not self.stderr


class SandboxViolation(Exception):
    """Raised when code attempts to use a forbidden capability."""


class NonDeterministicProgram(Exception):
    """Raised when repeated executions produce different outputs."""


class SafeExecutor:
    def __init__(self, time_limit: float = 5.0, memory_limit_mb: int = 256) -> None:
        self.time_limit = time_limit
        self.memory_limit_mb = memory_limit_mb

    def validate_source(self, source: str) -> None:
        lowered = source.lower()
        for token in BANNED_TOKENS:
            if token in lowered:
                raise SandboxViolation(f"Forbidden token detected: {token}")

    def execute(self, source: str, input_data: Any) -> ExecutionResult:
        self.validate_source(source)
        with tempfile.TemporaryDirectory() as tmpdir:
            program_path = pathlib.Path(tmpdir) / "program.py"
            program_path.write_text(source, encoding="utf-8")
            input_payload = json.dumps(input_data)
            cmd = [sys.executable, str(program_path)]
            return self._run_with_limits(cmd, input_payload)

    def execute_deterministic(self, source: str, input_data: Any, repetitions: int = 2) -> ExecutionResult:
        outputs: List[str] = []
        last_result: ExecutionResult | None = None
        for _ in range(repetitions):
            result = self.execute(source, input_data)
            if not result.succeeded:
                return result
            payload = json.dumps(result.output, sort_keys=True)
            outputs.append(payload)
            last_result = result
        if len(set(outputs)) != 1:
            raise NonDeterministicProgram("Program produced differing outputs across executions")
        assert last_result is not None
        return last_result

    def _run_with_limits(self, cmd: List[str], stdin_payload: str) -> ExecutionResult:
        preexec_fn = None
        if hasattr(os, "setsid"):
            def _set_limits() -> None:
                try:
                    import resource

                    soft_mem = self.memory_limit_mb * 1024 * 1024
                    resource.setrlimit(resource.RLIMIT_AS, (soft_mem, soft_mem))
                    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
                    resource.setrlimit(resource.RLIMIT_CPU, (int(self.time_limit), int(self.time_limit)))
                except Exception:
                    pass
                os.setsid()

            preexec_fn = _set_limits

        with subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            preexec_fn=preexec_fn,
        ) as proc:
            try:
                stdout, stderr = proc.communicate(stdin_payload, timeout=self.time_limit)
            except subprocess.TimeoutExpired:
                with contextlib.suppress(ProcessLookupError):
                    if hasattr(os, "killpg"):
                        os.killpg(proc.pid, signal.SIGKILL)
                    else:
                        proc.kill()
                return ExecutionResult(output=None, stderr="timeout", return_code=-1, duration_seconds=self.time_limit)
        output = self._parse_output(stdout)
        return ExecutionResult(output=output, stderr=stderr.strip(), return_code=proc.returncode, duration_seconds=self.time_limit)

    @staticmethod
    def _parse_output(stream: str) -> Any:
        stream = stream.strip()
        if not stream:
            return None
        try:
            return json.loads(stream)
        except json.JSONDecodeError:
            return stream


__all__ = [
    "SafeExecutor",
    "ExecutionResult",
    "SandboxViolation",
    "NonDeterministicProgram",
]
