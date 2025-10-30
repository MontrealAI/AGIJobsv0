from __future__ import annotations

import dataclasses
import re
from dataclasses import dataclass
from typing import Iterable, List


_SEARCH_RE = re.compile(r"<<<<<<\s*SEARCH\n(?P<search>.*?)\n======\n(?P<replace>.*?)\n>>>>>>>\s*REPLACE", re.DOTALL)


@dataclass(slots=True)
class DiffBlock:
    search: str
    replace: str


@dataclass(slots=True)
class ProposedDiff:
    raw: str
    blocks: List[DiffBlock]
    source_model: str

    @staticmethod
    def parse(raw: str, source_model: str) -> "ProposedDiff":
        blocks: List[DiffBlock] = []
        for match in _SEARCH_RE.finditer(raw.strip()):
            blocks.append(DiffBlock(match.group("search"), match.group("replace")))
        if not blocks:
            raise ValueError("No SEARCH/REPLACE blocks detected in diff")
        return ProposedDiff(raw=raw, blocks=blocks, source_model=source_model)


def apply_diff(source: str, diff: ProposedDiff) -> str:
    mutated = source
    for block in diff.blocks:
        if block.search not in mutated:
            raise ValueError("Search block not found in source")
        mutated = mutated.replace(block.search, block.replace, 1)
    return mutated


__all__ = ["DiffBlock", "ProposedDiff", "apply_diff"]
