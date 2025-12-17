from __future__ import annotations

import sys
from pathlib import Path

# Ensure the demo's root directory is importable when running tests directly
# from the repository root (outside the curated demo runner). This mirrors the
# PYTHONPATH adjustments that ``demo.run_demo_tests`` performs for isolated
# suites so imports like ``import run_demo`` resolve consistently.
DEMO_ROOT = Path(__file__).resolve().parents[1]
if str(DEMO_ROOT) not in sys.path:
    sys.path.insert(0, str(DEMO_ROOT))
