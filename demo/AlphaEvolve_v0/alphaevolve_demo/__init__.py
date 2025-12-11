"""Proxy module exposing the canonical implementation stored under `AlphaEvolve-v0`."""
from __future__ import annotations

from importlib import util
from pathlib import Path
import sys

_pkg_dir = Path(__file__).resolve().parents[2] / "AlphaEvolve-v0"
_pkg_init = _pkg_dir / "alphaevolve_demo" / "__init__.py"

existing = sys.modules.get("alphaevolve_demo")
if existing and Path(getattr(existing, "__file__", "")).resolve() == _pkg_init:
    _alpha_pkg = existing
else:
    sys.path.insert(0, str(_pkg_dir))
    spec = util.spec_from_file_location(
        "alphaevolve_demo",
        _pkg_init,
        submodule_search_locations=[str(_pkg_init.parent)],
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load canonical alphaevolve_demo from {_pkg_init}")

    _alpha_pkg = util.module_from_spec(spec)
    sys.modules["alphaevolve_demo"] = _alpha_pkg
    spec.loader.exec_module(_alpha_pkg)

for name in getattr(_alpha_pkg, "__all__", []):
    module = getattr(_alpha_pkg, name)
    globals()[name] = module
    sys.modules.setdefault(f"{__name__}.{name}", module)

__all__ = getattr(_alpha_pkg, "__all__", [])

