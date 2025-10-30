from __future__ import annotations

import json

from absolute_zero_reasoner_demo.config_loader import load_config
from absolute_zero_reasoner_demo.loop import AbsoluteZeroDemo


def test_demo_runs_short_cycle(tmp_path) -> None:
    config = load_config()
    config.raw["azr"]["iterations"] = 3
    config.raw["azr"]["tasks_per_iteration"] = 2
    demo = AbsoluteZeroDemo(config)
    summaries = demo.run()
    assert len(summaries) == 3
    assert demo.economics.gmv_total >= 0
    assert demo.telemetry.json_path.exists()
    report = demo.telemetry.json_path.read_text(encoding="utf-8")
    data = json.loads(report)
    assert data, "telemetry json should not be empty"
