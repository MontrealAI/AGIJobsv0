from __future__ import annotations

from pathlib import Path

from alphaevolve_v0 import heuristics
from alphaevolve_v0.diff_engine import (
    DiffBlock,
    extract_evolve_blocks,
    extract_parameters,
    render_parameter_diff,
)


def test_parameter_diff_application() -> None:
    source = Path(heuristics.__file__).read_text()
    params = extract_parameters(source)
    updated = dict(params)
    updated["REP_WEIGHT"] = round(updated["REP_WEIGHT"] + 0.05, 2)
    diff = render_parameter_diff("test", previous=params, updated=updated)
    new_source = diff.apply(source)
    assert "REP_WEIGHT = " in new_source
    assert new_source.count("REP_WEIGHT") == source.count("REP_WEIGHT")


def test_extract_evolve_blocks_contains_score() -> None:
    source = Path(heuristics.__file__).read_text()
    blocks = extract_evolve_blocks(source)
    assert any("score_match" in name for name in blocks)


def test_diff_block_application() -> None:
    source = "VALUE = 1.00\n"
    block = DiffBlock(search="VALUE = 1.00", replace="VALUE = 1.10")
    assert block.apply(source) == "VALUE = 1.10\n"
