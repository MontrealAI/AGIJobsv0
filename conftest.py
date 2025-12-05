"""Repository-wide pytest configuration.

This file keeps test discovery deterministic by pinning the import path and
environment variables that several suites expect. Having the repository root in
``sys.path`` ensures demo and service packages resolve consistently without
relying on the caller's working directory. We also provide default values for
test shims used by the Onebox routes.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Make repository modules importable regardless of the invocation directory.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Standardize environment defaults for local runs.
os.environ.setdefault("PYTHONPATH", str(ROOT))
os.environ.setdefault("ONEBOX_TEST_FORCE_STUB_WEB3", "1")
