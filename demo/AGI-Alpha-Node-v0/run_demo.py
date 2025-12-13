"""Lightweight launcher for the AGI Alpha Node demo.

This wrapper keeps parity with other demos by allowing operators to run a
single, self-contained command. By default it loads the bundled configuration
and prints a status snapshot without requiring interactive input. Pass
additional arguments to reach the full interactive console.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Iterable, Optional

MODULE_PATH = Path(__file__).resolve().parent / "run_alpha_node.py"
spec = importlib.util.spec_from_file_location("agi_alpha_node_cli", MODULE_PATH)
if spec is None or spec.loader is None:  # pragma: no cover
    raise RuntimeError("Unable to load run_alpha_node module")
_run_alpha_node = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_run_alpha_node)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = list(argv) if argv is not None else None
    if not args:
        args = ["--config", str(_run_alpha_node.DEFAULT_CONFIG), "--action", "status"]
    return _run_alpha_node.main(args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
