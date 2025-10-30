#!/usr/bin/env python3
"""Convenience launcher for the Huxley–Gödel Machine demo."""
from __future__ import annotations

from pathlib import Path
import sys


def main() -> None:
    project_root = Path(__file__).resolve().parent
    repo_root = project_root.parent.parent
    src_path = project_root / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    try:
        import sitecustomize  # noqa: F401  # pylint: disable=unused-import
    except ImportError:
        pass

    from demo.huxley_godel_machine_v0.simulator.__main__ import main as cli_main

    cli_main(sys.argv[1:])


if __name__ == "__main__":
    main()
