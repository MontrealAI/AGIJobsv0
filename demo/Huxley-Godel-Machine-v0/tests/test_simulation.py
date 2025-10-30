from __future__ import annotations

import asyncio
import random

from hgm_demo.config import load_config
from hgm_demo.simulation import Simulator


def test_simulator_registers_child_quality() -> None:
    config = load_config("demo/Huxley-Godel-Machine-v0/config/demo_agialpha.yml")
    simulator = Simulator(config, random.Random(2))
    simulator.set_initial_quality("a1", 0.7)
    expansion = asyncio.run(simulator.expand("a1"))
    simulator.register_child("a2", "a1", expansion.quality_delta)
    assert 0.01 <= simulator._qualities["a2"] <= 0.99
