"""Activity worker wiring for the HGM orchestration workflow."""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, Dict

from hgm_core.config import EngineConfig

from orchestrator.tools.executors import RetryPolicy

from .workflows import HGMOrchestrationWorkflow
from .workflows.hgm import WorkflowConfig

LOGGER = logging.getLogger(__name__)

Activity = Callable[..., Awaitable[None]]


class HGMActivityWorker:
    """Bind workflow activities to a scheduler for worker execution."""

    def __init__(
        self,
        workflow: HGMOrchestrationWorkflow,
    ) -> None:
        self.workflow = workflow
        self.activities: Dict[str, Activity] = {
            "hgm.expand": self.workflow.expansion_activity,
            "hgm.evaluate": self.workflow.evaluation_activity,
        }

    async def dispatch(self, name: str, *args, **kwargs) -> None:
        handler = self.activities.get(name)
        if handler is None:
            raise KeyError(name)
        await handler(*args, **kwargs)


def build_worker(
    *,
    concurrency: int = 4,
    retry: RetryPolicy | None = None,
    engine_config: EngineConfig | None = None,
) -> HGMActivityWorker:
    """Construct a worker pre-wired with the HGM workflow activities."""

    workflow = HGMOrchestrationWorkflow(
        config=WorkflowConfig(concurrency=concurrency, retry=retry, engine=engine_config),
    )
    return HGMActivityWorker(workflow)


async def run_worker_forever(worker: HGMActivityWorker) -> None:
    """Placeholder loop simulating a long-running task worker."""

    LOGGER.info("HGM worker booted with %d activities", len(worker.activities))
    while True:
        await asyncio.sleep(3600)
