"""Integration tests for the Planetary Orchestrator Fabric demo."""
from __future__ import annotations

import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from planetary_fabric.simulation import run_high_load_blocking


def test_high_load_balance(tmp_path: Path) -> None:
    result = run_high_load_blocking(tmp_path, job_count=3_000, kill_and_resume=False)
    assert result.completion_rate >= 0.98
    assert result.max_depth_delta() < 250
    assert result.reassigned_jobs / result.total_jobs <= 0.025
    assert result.total_runtime > 0.0


def test_mid_run_checkpoint_recovery(tmp_path: Path) -> None:
    result = run_high_load_blocking(tmp_path, job_count=3_000, kill_and_resume=True)
    assert result.completion_rate >= 0.98
    assert result.reassigned_jobs / result.total_jobs <= 0.045
    assert result.max_depth_delta() < 300
    assert result.total_runtime > 0.0


def test_failed_worker_leaves_retry_to_orchestrator() -> None:
    import asyncio
    from planetary_fabric.config import DemoJobPayload, NodeConfig
    from planetary_fabric.jobs import Job, JobState
    from planetary_fabric.nodes import Node
    from planetary_fabric.router import RegionalRouter
    async def scenario():
        router = RegionalRouter("Earth")
        node = Node(NodeConfig("failure", "Earth", 1, ["general"]))
        node.online = False
        complete, requeue = asyncio.Queue(), asyncio.Queue()
        await router.add_node(node)
        await router.submit(JobState(Job("one", "Earth", DemoJobPayload("synthetic"))))
        await router.start(complete, requeue)
        assert await asyncio.wait_for(requeue.get(), 1) == "one"
        await asyncio.sleep(0)
        assert router.queued_jobs() == 0
        assert complete.empty()
        await router.shutdown()
    asyncio.run(scenario())


def test_duplicate_completion_is_counted_once(tmp_path: Path) -> None:
    import asyncio
    from planetary_fabric.config import CheckpointConfig, DemoJobPayload, RegionConfig
    from planetary_fabric.jobs import Job, JobState
    from planetary_fabric.orchestrator import PlanetaryOrchestrator
    async def scenario():
        orchestrator = PlanetaryOrchestrator([RegionConfig("Earth")], CheckpointConfig(tmp_path))
        job = Job("one", "Earth", DemoJobPayload("synthetic"))
        await orchestrator.register_job(job)
        try:
            await orchestrator.register_job(job)
            assert False, "duplicate ID admitted"
        except ValueError:
            pass
        collector = asyncio.create_task(orchestrator._completion_collector())
        for _ in range(2):
            await orchestrator._complete_queue.put(JobState(job, status="completed"))
        await asyncio.wait_for(orchestrator._complete_queue.join(), 1)
        assert orchestrator.metrics.completed_jobs == 1
        collector.cancel()
        try:
            await collector
        except asyncio.CancelledError:
            pass
    asyncio.run(scenario())


def test_invalid_job_count_does_not_remove_checkpoint_files(tmp_path: Path) -> None:
    checkpoint = tmp_path / "checkpoints"
    checkpoint.mkdir()
    sentinel = checkpoint / "operator-notes.txt"
    sentinel.write_text("preserve")
    for count in [0, -1, 1.5, 1000001]:
        try:
            run_high_load_blocking(tmp_path, job_count=count)
            assert False, "invalid count admitted"
        except ValueError:
            pass
    assert sentinel.read_text() == "preserve"


def test_fresh_run_invalidates_only_stale_checkpoint_before_first_save(tmp_path: Path) -> None:
    import asyncio
    from planetary_fabric.config import DemoJobPayload, SimulationConfig
    from planetary_fabric.jobs import Job
    from planetary_fabric.orchestrator import PlanetaryOrchestrator
    from planetary_fabric.simulation import _prepare_orchestrator

    async def scenario():
        config = SimulationConfig.demo(tmp_path)
        config.nodes = []
        config.checkpoint.interval_seconds = 3600
        old = PlanetaryOrchestrator(list(config.regions), config.checkpoint)
        await old.register_job(Job("old-mission", "Earth", DemoJobPayload("old")))
        await old._persist_checkpoint()
        checkpoint = config.checkpoint.resolve_path()
        notes = checkpoint.parent / "operator-notes.txt"
        notes.write_text("preserve")
        resumed = await _prepare_orchestrator(config, resume=True)
        try:
            assert "old-mission" in resumed.jobs
        finally:
            await resumed.shutdown(persist_state=False)
        fresh = await _prepare_orchestrator(config, resume=False)
        try:
            assert "old-mission" not in fresh.jobs
            assert not checkpoint.exists()
        finally:
            await fresh.shutdown(persist_state=False)
        recovered = await _prepare_orchestrator(config, resume=True)
        try:
            assert "old-mission" not in recovered.jobs
            assert recovered.metrics.total_jobs == 0
            assert notes.read_text() == "preserve"
        finally:
            await recovered.shutdown(persist_state=False)

    asyncio.run(scenario())
