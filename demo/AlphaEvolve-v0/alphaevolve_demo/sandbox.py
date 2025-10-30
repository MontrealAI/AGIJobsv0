"""Sandbox utilities for executing evolved heuristics safely."""
from __future__ import annotations

import ast
import builtins
import sys
import types
from dataclasses import dataclass
from typing import Any

ALLOWED_IMPORTS = {
    "math",
    "statistics",
    "random",
    "dataclasses",
    "dataclass",
    "typing",
    "Iterable",
    "List",
    "__future__",
    "annotations",
}
_SAFE_BUILTIN_NAMES = {
    "abs",
    "min",
    "max",
    "sum",
    "len",
    "range",
    "sorted",
    "enumerate",
    "set",
    "list",
    "dict",
    "float",
    "int",
    "bool",
    "zip",
    "__build_class__",
    "object",
}
ALLOWED_BUILTINS = {name: getattr(builtins, name) for name in _SAFE_BUILTIN_NAMES}
ALLOWED_BUILTINS["__import__"] = builtins.__import__


class SandboxError(RuntimeError):
    """Raised when unsafe constructs are detected."""


@dataclass
class CompiledHeuristics:
    module: types.ModuleType

    def score_match(self) -> Any:
        return getattr(self.module, "score_match")

    def price_job(self) -> Any:
        return getattr(self.module, "price_job")

    def rank_candidates(self) -> Any:
        return getattr(self.module, "rank_candidates")


class HeuristicSandbox:
    """Validates and compiles candidate heuristic code snippets."""

    def __init__(self) -> None:
        self.allowed_imports = ALLOWED_IMPORTS

    def compile(self, code: str) -> CompiledHeuristics:
        tree = ast.parse(code)
        self._validate_imports(tree)
        self._validate_forbidden_nodes(tree)
        module = types.ModuleType("alphaevolve_candidate")
        module.__dict__["__name__"] = "alphaevolve_candidate"
        module.__dict__["__builtins__"] = ALLOWED_BUILTINS
        sys.modules.setdefault("alphaevolve_candidate", module)
        exec(compile(tree, "<alphaevolve_candidate>", "exec"), module.__dict__, module.__dict__)
        for required in ("score_match", "price_job", "rank_candidates"):
            if required not in module.__dict__:
                raise SandboxError(f"Candidate missing required function: {required}")
        return CompiledHeuristics(module=module)

    def _validate_imports(self, tree: ast.AST) -> None:
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                names = [alias.name.split(".")[0] for alias in node.names]
                for name in names:
                    if name not in self.allowed_imports:
                        raise SandboxError(f"Import of module '{name}' is not permitted")

    def _validate_forbidden_nodes(self, tree: ast.AST) -> None:
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec", "open"}:
                raise SandboxError("Use of eval/exec/open is not permitted")
            if isinstance(node, ast.Attribute) and node.attr in {"__dict__", "__class__"}:
                raise SandboxError("Introspection primitives are not permitted")

