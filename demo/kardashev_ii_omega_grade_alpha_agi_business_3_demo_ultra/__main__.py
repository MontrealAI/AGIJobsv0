from __future__ import annotations

import importlib
import sys
from pathlib import Path


if __package__ in {None, ""}:  # Allow execution as a standalone script
    this_dir = Path(__file__).resolve().parent
    for path in (this_dir.parent, this_dir.parent.parent):
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

run_demo = importlib.import_module(
    "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra.run_demo"
)

if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    run_demo.run()
