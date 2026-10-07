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

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = Path(__file__).resolve().parent / "scripts" / "run-phase6-demo.ts"
TS_NODE_PATH = REPO_ROOT / "node_modules" / "ts-node" / "dist" / "bin.js"
TS_NODE_OPTS = "{\"module\":\"commonjs\"}"


def build_command(args: Iterable[str]) -> List[str]:
    """Construct the command used to execute the TypeScript orchestrator."""

    return [
        "node",
        str(TS_NODE_PATH),
        "--compiler-options",
        TS_NODE_OPTS,
        str(SCRIPT_PATH),
        *args,
    ]


def _execute(command: list[str]) -> int:
    """Run the orchestrator command and return its exit code."""

    # Use the installed, lockfile-governed runner; never download an executable.
    if not TS_NODE_PATH.is_file():
        print("Phase 6 dependencies are missing. Run `npm ci` from the repository root.", file=sys.stderr)
        return 2
    if not shutil.which(command[0]):
        print("Node.js is missing. Install the version in .nvmrc, then run `npm ci`.", file=sys.stderr)
        return 2
    try:
        result = subprocess.run(command, check=False, cwd=REPO_ROOT)
    except OSError as error:
        print(f"Unable to start Phase 6: {error}", file=sys.stderr)
        return 2
    return result.returncode


def main(argv: list[str] | None = None) -> int:
    """Entry point for Phase 6 demo orchestration.

    Args:
        argv: Optional list of arguments to forward to the TypeScript runner.
            When omitted, ``sys.argv[1:]`` is used so the wrapper behaves like a
            normal CLI shim.
    """

    args = list(argv) if argv is not None else sys.argv[1:]
    if args[:1] == ["--"]:
        args = args[1:]
    # Paths supplied by a caller retain their meaning even though execution uses
    # the repository root for tsconfig and package resolution.
    for index, arg in enumerate(args):
        if arg in ("--config", "--json") and index + 1 < len(args):
            value = args[index + 1]
            if value != "-" and not value.startswith("--"):
                args[index + 1] = str(Path(value).resolve())
        elif arg.startswith(("--config=", "--json=")):
            key, value = arg.split("=", 1)
            if value and value != "-":
                args[index] = f"{key}={Path(value).resolve()}"
    command = build_command(args)
    return _execute(command)


if __name__ == "__main__":
    raise SystemExit(main())
