#!/usr/bin/env python3
"""Convenience launcher for the Huxley–Gödel Machine demo."""
from __future__ import annotations

from pathlib import Path
import sys


def main() -> None:
    project_root = Path(__file__).resolve().parent
    src_path = project_root / "src"
    sys.path.insert(0, str(src_path))
    from hgm_v0_demo.demo_runner import main as demo_main

    demo_main(sys.argv[1:])


if __name__ == "__main__":
    main()
