"""Python wrapper for the Kardashev II platform demo.

This wrapper delegates to the legacy ``run-demo.cjs`` Node script while
providing a Python-friendly interface for CI and contributor workflows.
It mirrors the most important flags (``--output-dir``, ``--check``, and
``--print-commands``) and ensures outputs are written to the requested
location. The wrapper also surfaces clear error messages when Node is
missing or when the demo script cannot be located.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Sequence
import shutil


ROOT = Path(__file__).resolve().parent
NODE_SCRIPT = ROOT / "run-demo.cjs"
DEFAULT_OUTPUT_DIR = ROOT / "output" / "legacy"


def _ensure_node_available() -> str:
    node_path = shutil.which("node")
    if not node_path:
        raise RuntimeError("Node.js is required to run this demo but was not found in PATH.")
    return node_path


def _build_command(args: argparse.Namespace) -> list[str]:
    if not NODE_SCRIPT.exists():
        raise FileNotFoundError(f"Unable to find demo script at {NODE_SCRIPT}")

    cmd = [_ensure_node_available(), str(NODE_SCRIPT)]
    if args.output_dir:
        output_dir = Path(args.output_dir).expanduser().resolve()
        if not args.check:
            output_dir.mkdir(parents=True, exist_ok=True)
        cmd.extend(["--output-dir", str(output_dir)])
    if args.check:
        cmd.append("--check")
    if args.print_commands:
        cmd.append("--print-commands")
    return cmd


def run(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where generated artefacts should be written.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run the demo in validation mode without writing artefacts.",
    )
    parser.add_argument(
        "--print-commands",
        action="store_true",
        help="Show governance commands produced by the Node demo.",
    )
    args = parser.parse_args(argv)

    cmd = _build_command(args)
    completed = subprocess.run(cmd, text=True)
    return completed.returncode


if __name__ == "__main__":
    sys.exit(run())
