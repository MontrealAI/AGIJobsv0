"""Activity worker wiring for the HGM orchestration workflow."""

from __future__ import annotations

import asyncio
import importlib.util
import logging
import sys
from pathlib import Path
from typing import Awaitable, Callable, Dict

if importlib.util.find_spec("hgm_core") is None:
    repo_root = Path(__file__).resolve().parents[1]
    hgm_core_path = repo_root / "packages" / "hgm-core" / "src"
    if hgm_core_path.exists() and str(hgm_core_path) not in sys.path:
        sys.path.insert(0, str(hgm_core_path))

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
