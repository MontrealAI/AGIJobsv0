from __future__ import annotations

import asyncio
import json
from pathlib import Path

from alphaevolve_v0 import heuristics
from alphaevolve_v0.controller import AlphaEvolveController

CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "alphaevolve.json"


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())


def load_source() -> str:
    return Path(heuristics.__file__).read_text()


def test_controller_generates_improvement() -> None:
    controller = AlphaEvolveController(source=load_source(), config=load_config())
    champion = asyncio.run(controller.run(6))
    baseline_utility = controller.database.history()[0].metrics["Utility"]
    assert champion.metrics["Utility"] >= baseline_utility * 0.99
