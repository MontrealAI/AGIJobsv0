"""Pytest configuration for AlphaEvolve demo tests.

We explicitly disable auto-loading of third-party pytest plugins to
prevent web3.tools extras from attempting to import optional Ethereum
packages that are not part of the demo runtime. This keeps the unit
tests hermetic and ensures non-technical operators can run the demo's
verification suite without additional dependencies.
"""

from __future__ import annotations

import os

os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")
