"""Compat wrapper that forwards to the new TRM demo CLI."""

from __future__ import annotations

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PACKAGE_ROOT = CURRENT_DIR
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from trm_demo.cli import main


if __name__ == "__main__":  # pragma: no cover - CLI hand-off
    main(sys.argv[1:])

