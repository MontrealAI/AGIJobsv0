import asyncio
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
HGM_CORE_SRC = ROOT / "packages" / "hgm-core" / "src"
if str(HGM_CORE_SRC) not in sys.path:
    sys.path.insert(0, str(HGM_CORE_SRC))

from hgm_core.engine import HGMEngine

from services.sentinel import SentinelConfig, SentinelMonitor


def test_roi_floor_pauses_and_recovers_expansions():
    async def scenario() -> None:
        engine = HGMEngine()
        config = SentinelConfig(roi_floor=1.5, roi_grace_period=2, budget_cap=100.0, budget_soft_ratio=0.9)
        monitor = SentinelMonitor(engine, config)
        await engine.ensure_node("root/a")

        # Breach ROI floor twice to trigger pause
        await monitor.observe_evaluation("root/a", {"cost": 10.0, "value": 5.0, "success": False})
        await monitor.observe_evaluation("root/a", {"cost": 10.0, "value": 5.0, "success": False})
        await monitor.drain()

        assert monitor.snapshot().roi_breach_count >= 2
        assert not await engine.expansions_allowed()

        # Provide high ROI observations to recover
        await monitor.observe_evaluation("root/a", {"cost": 1.0, "value": 30.0, "success": True})
        await monitor.observe_evaluation("root/a", {"cost": 1.0, "value": 30.0, "success": True})
        await monitor.drain()

        assert await engine.expansions_allowed()
        await monitor.close()

    asyncio.run(scenario())


def test_failure_streak_prunes_agents_and_budget_halt():
    async def scenario() -> None:
        engine = HGMEngine()
        config = SentinelConfig(
            roi_floor=0.5,
            roi_grace_period=1,
            budget_cap=50.0,
            budget_soft_ratio=0.5,
        )
        config.failure_streak.threshold = 3
        monitor = SentinelMonitor(engine, config)
        await engine.ensure_node("root/b")

        # Trigger failure streak
        for _ in range(3):
            await monitor.observe_evaluation("root/b", {"success": False, "reward": 0.1})
        await monitor.drain()

        assert monitor.is_agent_pruned("root/b")
        assert "root/b" in monitor.snapshot().pruned_agents
        assert await engine.is_pruned("root/b") is True

        # Exceed hard budget
        await monitor.observe_expansion("root/b", {"cost": 60.0})
        await monitor.drain()

        assert monitor.stop_requested is True
        assert monitor.snapshot().stop_reason == "budget_cap"
        await monitor.close()

    asyncio.run(scenario())


def test_idle_monitor_does_not_increase_roi_breaches():
    async def scenario() -> None:
        engine = HGMEngine()
        config = SentinelConfig(
            roi_floor=2.0,
            roi_grace_period=3,
            monitor_interval_seconds=0.1,
        )
        monitor = SentinelMonitor(engine, config)
        await engine.ensure_node("root/c")

        await monitor.observe_evaluation("root/c", {"cost": 10.0, "value": 5.0, "success": False})
        await monitor.drain()

        snapshot = monitor.snapshot()
        assert snapshot.roi_breach_count == 1

        await asyncio.sleep(config.monitor_interval_seconds * 3)

        assert monitor.snapshot().roi_breach_count == snapshot.roi_breach_count
        await monitor.close()

    asyncio.run(scenario())
