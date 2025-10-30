"""Utilities for applying AlphaEvolve style SEARCH/REPLACE diffs."""
from __future__ import annotations

import re
from dataclasses import dataclass


DIFF_BLOCK_PATTERN = re.compile(
    r"<<<<<<\s*SEARCH\n(?P<search>.*?)======\n(?P<replace>.*?)>>>>>>\s*REPLACE",
    re.DOTALL,
)


@dataclass(frozen=True)
class DiffBlock:
    search: str
    replace: str

    def apply(self, target: str) -> str:
        if self.search not in target:
            candidate = self.search.rstrip("\n")
            if candidate and candidate in target:
                return target.replace(candidate, self.replace.rstrip("\n"), 1)
            raise ValueError("SEARCH block not found in target code")
        return target.replace(self.search, self.replace, 1)


def parse_diff(diff_text: str) -> list[DiffBlock]:
    blocks: list[DiffBlock] = []
    for match in DIFF_BLOCK_PATTERN.finditer(diff_text.strip()):
        block = DiffBlock(search=match.group("search"), replace=match.group("replace"))
        blocks.append(block)
    if not blocks:
        raise ValueError("No valid diff blocks detected")
    return blocks


def apply_diff(code: str, diff_text: str) -> str:
    blocks = parse_diff(diff_text)
    updated = code
    for block in blocks:
        updated = block.apply(updated)
    return updated

