"""Test configuration to ensure repo modules are importable."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("PYTHONPATH", str(ROOT))
os.environ.setdefault("RPC_URL", "http://localhost:8545")
# Ensure the onebox routes import with stable test shims before collection.
os.environ.setdefault("ONEBOX_TEST_FORCE_STUB_WEB3", "1")
