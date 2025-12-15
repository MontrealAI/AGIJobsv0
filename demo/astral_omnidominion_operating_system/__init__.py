"""Python import shim for the Astral Omnidominion demo utilities."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_run_demo_module():
    module_path = Path(__file__).resolve().parent.parent / "astral-omnidominion-operating-system" / "run_demo.py"
    spec = importlib.util.spec_from_file_location("astral_omnidominion.run_demo", module_path)
    if spec is None or spec.loader is None:  # pragma: no cover - defensive
        raise ImportError(f"Unable to load run_demo from {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    sys.modules[f"{__name__}.run_demo"] = module
    return module


run_demo = _load_run_demo_module()

__all__ = ["run_demo"]
