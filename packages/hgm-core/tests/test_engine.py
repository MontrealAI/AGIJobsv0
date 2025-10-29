import asyncio

import pytest

from hgm_core.config import EngineConfig
from hgm_core.engine import HGMEngine


def test_engine_applies_widening_rule():
    async def scenario():
        config = EngineConfig(widening_alpha=0.5, seed=7)
        engine = HGMEngine(config)
        await engine.ensure_node("root")

        action = await engine.next_action("root", ["a", "b", "c"])
        assert action == "a"

        await engine.record_evaluation("root/a", reward=1.0)

        choice = await engine.next_action("root", ["a", "b", "c"])
        assert choice == "a"

        for _ in range(3):
            await engine.record_evaluation("root/a", reward=0.0)
        action = await engine.next_action("root", ["a", "b", "c"])
        assert action == "b"

    asyncio.run(scenario())


def test_callbacks_receive_payloads():
    expansions: list[tuple[str, dict[str, object]]] = []
    evaluations: list[tuple[str, dict[str, object]]] = []

    async def on_expansion(node, payload):
        expansions.append((node.key, payload))

    def on_evaluation(node, payload):
        evaluations.append((node.key, payload))

    async def scenario():
        engine = HGMEngine(
            EngineConfig(seed=1),
            on_expansion_result=on_expansion,
            on_evaluation_result=on_evaluation,
        )

        action = await engine.next_action("root", ["x"])
        assert action == "x"
        await engine.record_expansion("root", "x", payload={"extra": 42})
        await asyncio.sleep(0)

        await engine.record_evaluation("root/x", reward=0.5, weight=2.0)

    asyncio.run(scenario())

    assert expansions == [("root/x", {"action": "x", "extra": 42})]
    assert evaluations[0][0] == "root/x"
    assert evaluations[0][1]["reward"] == 0.5
    assert evaluations[0][1]["cmp"]["weight"] == pytest.approx(2.0)
