"""Python launcher for the Phase 6 Scaling Multi Domain Expansion demo.

This wrapper keeps the developer and operator experience consistent with other
Python-first demos while delegating execution to the underlying TypeScript
orchestrator. It ensures the repository root is on ``PATH``/``PWD`` and
forwards any additional arguments directly to the TypeScript script, making it
trivial to run:

```
python demo/Phase-6-Scaling-Multi-Domain-Expansion/run_demo.py -- --config custom.json
```
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Iterable, List

SCRIPT_PATH = Path(__file__).resolve().parent / "scripts" / "run-phase6-demo.ts"
TS_NODE_OPTS = "{\"module\":\"commonjs\"}"


def build_command(args: Iterable[str]) -> List[str]:
    """Construct the command used to execute the TypeScript orchestrator."""

    return [
        "npx",
        "ts-node",
        "--compiler-options",
        TS_NODE_OPTS,
        str(SCRIPT_PATH),
        *args,
    ]


def _execute(command: list[str]) -> int:
    """Run the orchestrator command and return its exit code."""

    result = subprocess.run(command, check=False)
    return result.returncode


def main(argv: list[str] | None = None) -> int:
    """Entry point for Phase 6 demo orchestration.

    Args:
        argv: Optional list of arguments to forward to the TypeScript runner.
            When omitted, ``sys.argv[1:]`` is used so the wrapper behaves like a
            normal CLI shim.
    """

    args = list(argv) if argv is not None else sys.argv[1:]
    command = build_command(args)
    return _execute(command)


if __name__ == "__main__":
    raise SystemExit(main())
