"""Deterministic sandbox executor for demo purposes."""
from __future__ import annotations

import contextlib
import io
import json
import multiprocessing
import queue
import resource
import signal
import sys
import traceback
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Dict, Iterable, Optional

from .config import DemoConfig
from .utils import ExecutionResult, normalise_output


@dataclass
class SandboxExecutor:
    """Execute python snippets in an isolated process."""

    config: DemoConfig

    def execute(self, program: str, payload: Dict[str, Any]) -> ExecutionResult:
        parent_conn, child_conn = multiprocessing.Pipe()
        process = multiprocessing.Process(
            target=_worker,
            args=(
                child_conn,
                program,
                payload,
                self.config.execution_policy.timeout_seconds,
                self.config.execution_policy.memory_limit_mb,
                tuple(self.config.execution_policy.banned_tokens),
                self.config.execution_policy.determinism_runs,
            ),
        )
        process.start()
        process.join(self.config.execution_policy.timeout_seconds + 0.5)
        if process.is_alive():
            process.terminate()
            process.join()
            return ExecutionResult(None, "Execution timed out", self.config.execution_policy.timeout_seconds)
        try:
            result = parent_conn.recv()
        except EOFError:
            return ExecutionResult(None, "Executor crashed", self.config.execution_policy.timeout_seconds)
        if result.error:
            return ExecutionResult(None, result.error, result.runtime)
        return ExecutionResult(result.output, None, result.runtime)


def _worker(conn, program, payload, timeout_seconds, memory_limit_mb, banned, determinism_runs):
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError()))
    try:
        resource.setrlimit(resource.RLIMIT_AS, (memory_limit_mb * 1024 * 1024, ) * 2)
    except (ValueError, OSError):
        pass

    if any(token in program for token in banned):
        conn.send(SimpleNamespace(output=None, error="Banned token detected", runtime=0.0))
        conn.close()
        return

    try:
        outputs = []
        for _ in range(determinism_runs):
            runtime = _execute_once(program, payload, timeout_seconds)
            outputs.append(runtime.output)
        if len(set(outputs)) != 1:
            conn.send(SimpleNamespace(output=None, error="Non deterministic output", runtime=0.0))
            return
        conn.send(SimpleNamespace(output=outputs[0], error=None, runtime=runtime.runtime))
    except Exception as exc:  # noqa: BLE001 - we convert to string for operator clarity
        conn.send(SimpleNamespace(output=None, error=str(exc), runtime=0.0))
    finally:
        conn.close()


def _execute_once(program, payload, timeout_seconds):
    signal.alarm(int(timeout_seconds))
    stdout = io.StringIO()
    start = resource.getrusage(resource.RUSAGE_SELF).ru_utime
    try:
        local_env: Dict[str, Any] = {}
        exec(program, {"__builtins__": {"range": range, "len": len, "sum": sum, "min": min, "max": max}}, local_env)
        entry = local_env.get("__azr_entry__")
        if entry is None:
            entry = next(iter(local_env.values()))
        result = entry(payload)
        output = normalise_output(json.dumps(result, sort_keys=True))
        end = resource.getrusage(resource.RUSAGE_SELF).ru_utime
        runtime = max(0.0, end - start)
        return SimpleNamespace(output=output, runtime=runtime)
    finally:
        signal.alarm(0)
