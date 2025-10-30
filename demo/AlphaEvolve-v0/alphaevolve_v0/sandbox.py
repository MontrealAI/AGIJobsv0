"""Sandbox utilities for compiling candidate heuristic modules safely."""

from __future__ import annotations

import ast
import builtins
import sys
from types import ModuleType
from typing import Any, Dict

from .diff_engine import sanitize_source

SAFE_BUILTINS = {
    "abs": builtins.abs,
    "min": builtins.min,
    "max": builtins.max,
    "sum": builtins.sum,
    "len": builtins.len,
    "sorted": builtins.sorted,
    "round": builtins.round,
    "range": builtins.range,
    "enumerate": builtins.enumerate,
    "float": builtins.float,
    "int": builtins.int,
    "bool": builtins.bool,
    "list": builtins.list,
    "dict": builtins.dict,
    "set": builtins.set,
    "tuple": builtins.tuple,
    "__import__": builtins.__import__,
    "__build_class__": builtins.__build_class__,
}

SAFE_IMPORTS = {"dataclasses", "typing", "__future__"}


class SandboxViolation(Exception):
    """Raised when unapproved behaviour is detected in candidate code."""


class Sandbox:
    """Compile and execute heuristic code in a restricted namespace."""

    def __init__(self, *, module_name: str = "alphaevolve_candidate") -> None:
        self.module_name = module_name

    def compile(self, source: str) -> ModuleType:
        sanitized = sanitize_source(source)
        try:
            tree = ast.parse(sanitized, mode="exec")
        except SyntaxError as exc:
            raise SandboxViolation(f"Syntax error in candidate code: {exc}") from exc
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    if root not in SAFE_IMPORTS:
                        raise SandboxViolation(f"Import of module '{root}' is not permitted")
            elif isinstance(node, ast.ImportFrom):
                module = (node.module or "").split(".")[0]
                if module not in SAFE_IMPORTS:
                    raise SandboxViolation(f"Import from module '{module}' is not permitted")
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id in {"eval", "exec", "open"}:
                    raise SandboxViolation(f"Call to forbidden builtin: {node.func.id}")
        code = compile(tree, filename=f"<sandbox:{self.module_name}>", mode="exec")
        module = ModuleType(self.module_name)
        module.__dict__["__builtins__"] = SAFE_BUILTINS
        sys.modules[self.module_name] = module
        exec(code, module.__dict__)  # noqa: S102 - executed in restricted namespace
        return module

    def load_functions(self, module: ModuleType, required: Dict[str, str]) -> Dict[str, Any]:
        loaded: Dict[str, Any] = {}
        for attr, description in required.items():
            if not hasattr(module, attr):
                raise SandboxViolation(f"Candidate module missing required function: {attr}")
            loaded[attr] = getattr(module, attr)
            if not callable(loaded[attr]):
                raise SandboxViolation(f"{description} is not callable")
        return loaded


__all__ = ["Sandbox", "SandboxViolation"]
