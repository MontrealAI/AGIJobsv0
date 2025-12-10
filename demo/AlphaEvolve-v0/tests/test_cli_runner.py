import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alphaevolve_runner import build_parser, run_demo


def test_iterations_alias_creates_report(tmp_path):
    parser = build_parser()
    output_path = tmp_path / "report.json"

    args = parser.parse_args(
        ["run", "--iterations", "1", "--output", str(output_path), "--seed", "13"]
    )

    run_demo(args)

    payload = json.loads(output_path.read_text())
    assert payload["history"][0]["generation"] == 1
    assert payload["champion"]["Utility"] > 0
