from __future__ import annotations

import importlib.util
import pathlib
import sys
from importlib.machinery import ModuleSpec
from types import ModuleType


_PACKAGE_DIR = pathlib.Path(__file__).resolve().parent.parent / "Validator-Constellation-v0"


def load(module_name: str) -> ModuleType:
    path = _PACKAGE_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(
        f"demo.Validator-Constellation-v0.{module_name}", path
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module {module_name} from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(f"demo.Validator-Constellation-v0.{module_name}", module)
    spec.loader.exec_module(module)
    return module


def expose(module_name: str) -> ModuleType:
    source = load(module_name)
    sanitized_name = f"demo.validator_constellation_v0.{module_name}"
    module = sys.modules.get(sanitized_name)
    if module is None:
        module = ModuleType(sanitized_name)
        module.__dict__.update(source.__dict__)
        module.__file__ = getattr(source, "__file__", None)
        module.__loader__ = getattr(source, "__loader__", None)
        module.__package__ = "demo.validator_constellation_v0"
        module.__spec__ = ModuleSpec(sanitized_name, loader=module.__loader__)
        sys.modules[sanitized_name] = module
    return module
