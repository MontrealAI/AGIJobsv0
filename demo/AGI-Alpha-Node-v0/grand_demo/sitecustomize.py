"""Grand demo site customisation for AGI Alpha Node."""
from __future__ import annotations

import os
import runpy
from pathlib import Path

# Disable auto-loading external pytest plugins that may be installed globally.
os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

# Reuse the demo-level sitecustomize to keep path tweaks consistent when running
# from within the nested grand_demo folder.
PARENT_CUSTOMIZE = Path(__file__).resolve().parents[1] / "sitecustomize.py"
if PARENT_CUSTOMIZE.exists():
    runpy.run_path(str(PARENT_CUSTOMIZE))
