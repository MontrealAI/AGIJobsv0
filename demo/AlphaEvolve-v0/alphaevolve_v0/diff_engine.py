"""Diff utilities for AlphaEvolve demo.

The AlphaEvolve controller exchanges SEARCH/REPLACE diff blocks with synthetic
LLM models.  This module parses, validates, and applies those diffs to the
heuristics source code within EVOLVE-BLOCK markers.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Sequence

DIFF_BLOCK_PATTERN = re.compile(
    r"<<<<<<<\s+SEARCH\n(?P<search>.*?)======\n(?P<replace>.*?)>>>>>>>\s+REPLACE",
    re.DOTALL,
)


@dataclass(slots=True)
class DiffBlock:
    search: str
    replace: str

    def apply(self, source: str) -> str:
        if self.search not in source:
            raise ValueError("Search fragment not found in source")
        return source.replace(self.search, self.replace, 1)


@dataclass(slots=True)
class DiffProposal:
    identifier: str
    blocks: List[DiffBlock] = field(default_factory=list)
    origin: str = "unknown"
    metadata: dict[str, object] | None = None

    @classmethod
    def from_text(cls, identifier: str, text: str, *, origin: str = "unknown") -> "DiffProposal":
        blocks: List[DiffBlock] = []
        for match in DIFF_BLOCK_PATTERN.finditer(text.strip()):
            search = match.group("search").rstrip("\n")
            replace = match.group("replace").rstrip("\n")
            blocks.append(DiffBlock(search=search, replace=replace))
        if not blocks:
            raise ValueError("No diff blocks parsed from text")
        return cls(identifier=identifier, blocks=blocks, origin=origin)

    def apply(self, source: str) -> str:
        updated = source
        for block in self.blocks:
            updated = block.apply(updated)
        return updated


def apply_diffs(source: str, diffs: Sequence[DiffProposal]) -> str:
    updated = source
    for diff in diffs:
        updated = diff.apply(updated)
    return updated


EVOLVE_BLOCK_PATTERN = re.compile(
    r"#\s*EVOLVE-BLOCK-START:(?P<name>.*?)\n(?P<body>.*?)#\s*EVOLVE-BLOCK-END",
    re.DOTALL,
)


def extract_evolve_blocks(source: str) -> dict[str, str]:
    blocks: dict[str, str] = {}
    for match in EVOLVE_BLOCK_PATTERN.finditer(source):
        name = match.group("name").strip()
        body = match.group("body")
        blocks[name] = body
    return blocks


PARAM_PATTERN = re.compile(r"^(?P<name>[A-Z_]+)\s*=\s*(?P<value>-?\d+\.\d+)", re.MULTILINE)


def extract_parameters(source: str) -> dict[str, float]:
    params: dict[str, float] = {}
    for match in PARAM_PATTERN.finditer(source):
        params[match.group("name")] = float(match.group("value"))
    return params


def render_parameter_diff(
    identifier: str,
    *,
    previous: dict[str, float],
    updated: dict[str, float],
) -> DiffProposal:
    blocks: List[DiffBlock] = []
    for key, old_value in previous.items():
        new_value = updated.get(key, old_value)
        if abs(new_value - old_value) < 1e-12:
            continue
        search = f"{key} = {old_value:.2f}"
        replace = f"{key} = {new_value:.2f}"
        blocks.append(DiffBlock(search=search, replace=replace))
    if not blocks:
        raise ValueError("No parameter changes to render")
    return DiffProposal(identifier=identifier, blocks=blocks, origin="parameter-adjustment")


def sanitize_source(source: str) -> str:
    forbidden = ["__import__", "eval(", "exec(", "open(", "os.", "subprocess"]
    for forbidden_token in forbidden:
        if forbidden_token in source:
            raise ValueError(f"Forbidden token detected in source: {forbidden_token}")
    return source


__all__ = [
    "DiffBlock",
    "DiffProposal",
    "apply_diffs",
    "extract_evolve_blocks",
    "extract_parameters",
    "render_parameter_diff",
    "sanitize_source",
]
