import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alphaevolve.diff import ProposedDiff, apply_diff


def test_apply_diff_single_block():
    source = "value = 1\n"
    diff = ProposedDiff.parse("<<<<<< SEARCH\nvalue = 1\n======\nvalue = 2\n>>>>>>> REPLACE", source_model="test")
    mutated = apply_diff(source, diff)
    assert "value = 2" in mutated
