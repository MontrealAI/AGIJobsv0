from __future__ import annotations

import importlib
import sys
from pathlib import Path


def test_wrapper_delegates_to_source_package(tmp_path: Path) -> None:
    wrapper = importlib.import_module("demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo")

    source_root = Path(__file__).resolve().parents[2] / "Kardashev-II Omega-Grade-α-AGI Business-3"
    sys.path.insert(0, str(source_root))
    try:
        source_pkg = importlib.import_module("kardashev_ii_omega_grade_alpha_agi_business_3_demo")
    finally:
        sys.path.remove(str(source_root))

    assert wrapper.main.__code__.co_filename == source_pkg.main.__code__.co_filename
    assert callable(wrapper.main)
    assert "main" in wrapper.__all__
