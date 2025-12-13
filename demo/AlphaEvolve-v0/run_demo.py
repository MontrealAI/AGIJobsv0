"""AlphaEvolve demo entrypoint.

This thin wrapper keeps the standalone script usable when the
package has not been installed into the environment. It mirrors
the rest of the demo gallery's `run_demo.py` convention so operators
can invoke the experiment with a consistent command.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure the demo package is importable when executed directly.
DEMO_ROOT = Path(__file__).resolve().parent
if str(DEMO_ROOT) not in sys.path:
    sys.path.insert(0, str(DEMO_ROOT))

from alphaevolve_runner import main


if __name__ == "__main__":  # pragma: no cover - exercised via integration test
    main()
