import asyncio

import pytest

from orchestrator.worker import build_worker, run_worker_forever


def test_build_worker_and_dispatch_records_events():
    async def runner() -> None:
        worker = build_worker(concurrency=2)
        await worker.workflow.ensure_node("root")

        await worker.dispatch("hgm.expand", "root", "child", payload={"quality": 0.8})
        await worker.dispatch("hgm.evaluate", "root", 0.75, weight=0.5, payload={"score": 0.75})

        assert worker.workflow.expansion_events, "Expansion dispatch should record an event"
        assert worker.workflow.evaluation_events, "Evaluation dispatch should record an event"

        with pytest.raises(KeyError):
            await worker.dispatch("unknown.activity")

    asyncio.run(runner())


def test_run_worker_forever_invokes_sleep(monkeypatch):
    async def runner() -> None:
        worker = build_worker()
        calls: list[float] = []

        async def fake_sleep(interval: float) -> None:
            calls.append(interval)
            raise asyncio.CancelledError

        monkeypatch.setattr(asyncio, "sleep", fake_sleep)

        with pytest.raises(asyncio.CancelledError):
            await run_worker_forever(worker)

        assert calls == [3600], "Worker loop should sleep for an hour between polls"

    asyncio.run(runner())
