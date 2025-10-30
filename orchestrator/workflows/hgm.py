"""Workflow driving the Hierarchical Generative Machine orchestration."""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Dict, Iterable, Optional, Sequence

from hgm_core.config import EngineConfig
from hgm_core.engine import HGMEngine
from hgm_core.types import AgentNode

from .scheduler import TaskScheduler
from orchestrator.tools.executors import RetryPolicy
from backend.models.hgm import HgmRepository

LOGGER = logging.getLogger(__name__)

ExpansionWork = Callable[[str], Awaitable[Dict[str, object] | None]]
EvaluationWork = Callable[[], Awaitable[tuple[float, float | None]]]


@dataclass(slots=True)
class WorkflowConfig:
    """Configuration for :class:`HGMOrchestrationWorkflow`."""

    concurrency: int = 4
    retry: RetryPolicy | None = None
    engine: EngineConfig | None = None
    run_id: str | None = None
    root_agent: str = "root"
    run_metadata: dict[str, object] = field(default_factory=dict)
    repository: HgmRepository | None = None


class HGMOrchestrationWorkflow:
    """Coordinate HGM engine actions with asynchronous workers."""

    def __init__(
        self,
        *,
        scheduler: TaskScheduler | None = None,
        engine: HGMEngine | None = None,
        config: WorkflowConfig | None = None,
    ) -> None:
        self._config = config or WorkflowConfig()
        retry_policy = self._config.retry or RetryPolicy()
        self._scheduler = scheduler or TaskScheduler(concurrency=self._config.concurrency, retry=retry_policy)
        engine_config = self._config.engine or EngineConfig()
        self._run_id = self._config.run_id or uuid.uuid4().hex
        self._repository = self._config.repository
        if self._repository is None:
            try:
                self._repository = HgmRepository()
            except Exception:  # pragma: no cover - fallback when DB unavailable
                LOGGER.warning("HGM persistence unavailable", exc_info=True)
                self._repository = None
        self._engine = engine or HGMEngine(
            engine_config,
            on_expansion_result=self._on_expansion_result,
            on_evaluation_result=self._on_evaluation_result,
        )
        self._engine_lock = asyncio.Lock()
        self._busy_lock = asyncio.Lock()
        self._busy_agents: set[str] = set()
        self.expansion_events: list[tuple[str, Dict[str, object]]] = []
        self.evaluation_events: list[tuple[str, Dict[str, object]]] = []
        self._root_agent = self._config.root_agent
        if self._repository is not None:
            try:
                self._repository.ensure_run(self._run_id, self._root_agent, dict(self._config.run_metadata))
                self._repository.ensure_agent(self._run_id, self._root_agent, None, {"label": self._root_agent})
            except Exception:  # pragma: no cover - defensive guard
                LOGGER.warning("Failed to prime HGM persistence", exc_info=True)
                self._repository = None

    # ------------------------------------------------------------------
    # Internal synchronisation helpers
    def _engine_guard(self) -> asyncio.Lock:
        return self._engine_lock

    def _busy_guard(self) -> asyncio.Lock:
        return self._busy_lock

    async def _invoke_with_engine(self, coro: Awaitable[object | None]) -> object | None:
        lock = self._engine_guard()
        async with lock:
            return await coro

    async def _on_expansion_result(self, node: AgentNode, payload: Dict[str, object]) -> None:
        self.expansion_events.append((node.key, dict(payload)))
        if self._repository is not None:
            data = dict(payload)
            parent = node.parent
            try:
                await asyncio.to_thread(
                    self._repository.record_expansion,
                    self._run_id,
                    node.key,
                    parent,
                    data,
                )
            except Exception:  # pragma: no cover - persistence errors should not break workflow
                LOGGER.warning("Failed to persist expansion event for %s", node.key, exc_info=True)

    async def _on_evaluation_result(self, node: AgentNode, payload: Dict[str, object]) -> None:
        self.evaluation_events.append((node.key, dict(payload)))
        if self._repository is not None:
            data = dict(payload)
            try:
                await asyncio.to_thread(
                    self._repository.record_evaluation,
                    self._run_id,
                    node.key,
                    data,
                )
            except Exception:  # pragma: no cover - persistence errors should not break workflow
                LOGGER.warning("Failed to persist evaluation event for %s", node.key, exc_info=True)

    # ------------------------------------------------------------------
    # Public engine adapters
    async def ensure_node(self, key: str, **metadata: object) -> AgentNode:
        node = await self._invoke_with_engine(self._engine.ensure_node(key, **metadata))
        if self._repository is not None:
            combined = dict(node.metadata)
            combined.update(metadata)
            try:
                await asyncio.to_thread(
                    self._repository.ensure_agent,
                    self._run_id,
                    node.key,
                    node.parent,
                    combined,
                )
            except Exception:  # pragma: no cover - persistence failure should not break workflow
                LOGGER.warning("Failed to persist ensure_node for %s", node.key, exc_info=True)
        return node

    async def next_action(self, key: str, actions: Sequence[str]) -> Optional[str]:
        return await self._invoke_with_engine(self._engine.next_action(key, actions))

    async def expansion_activity(
        self,
        parent_key: str,
        action: str,
        *,
        payload: Dict[str, object] | None = None,
    ) -> None:
        await self._invoke_with_engine(self._engine.record_expansion(parent_key, action, payload=payload))

    async def evaluation_activity(
        self,
        node_key: str,
        reward: float,
        *,
        weight: float = 1.0,
    ) -> None:
        await self._invoke_with_engine(self._engine.record_evaluation(node_key, reward, weight=weight))

    async def snapshot(self) -> Dict[str, AgentNode]:
        return await self._invoke_with_engine(self._engine.snapshot())

    async def engine_config(self) -> EngineConfig:
        """Return a snapshot of the underlying engine configuration."""

        return await self._invoke_with_engine(self._engine.get_config())

    async def update_engine_parameters(
        self,
        *,
        widening_alpha: float | None = None,
        min_visitations: int | None = None,
        thompson_prior: float | None = None,
    ) -> EngineConfig:
        """Adjust engine parameters under the workflow lock."""

        return await self._invoke_with_engine(
            self._engine.update_parameters(
                widening_alpha=widening_alpha,
                min_visitations=min_visitations,
                thompson_prior=thompson_prior,
            )
        )

    # ------------------------------------------------------------------
    # Scheduling helpers
    async def schedule_expansion(
        self,
        parent_key: str,
        actions: Sequence[str],
        work: ExpansionWork,
        *,
        request_id: str | None = None,
    ) -> bool:
        choice = await self.next_action(parent_key, actions)
        if choice is None:
            LOGGER.debug("No expansion available for %s", parent_key)
            return False
        child_key = f"{parent_key}/{choice}"

        busy_lock = self._busy_guard()
        async with busy_lock:
            if child_key in self._busy_agents:
                LOGGER.debug("Expansion for %s already in progress", child_key)
                return False
            self._busy_agents.add(child_key)

        task_id = request_id or f"expand:{child_key}:{uuid.uuid4().hex}"

        async def _run() -> None:
            payload = await work(choice)
            await self.expansion_activity(parent_key, choice, payload=payload or {})

        async def _cleanup(success: bool, error: Exception | None) -> None:
            del success, error
            async with busy_lock:
                self._busy_agents.discard(child_key)

        scheduled = await self._scheduler.schedule(task_id, _run, on_complete=_cleanup)
        if not scheduled:
            async with busy_lock:
                self._busy_agents.discard(child_key)
        return scheduled

    async def schedule_evaluation(
        self,
        node_key: str,
        work: EvaluationWork,
        *,
        request_id: str | None = None,
    ) -> bool:
        await self.ensure_node(node_key)
        busy_lock = self._busy_guard()
        async with busy_lock:
            if node_key in self._busy_agents:
                LOGGER.debug("Evaluation for %s skipped because agent is busy", node_key)
                return False
            self._busy_agents.add(node_key)

        task_id = request_id or f"evaluate:{node_key}:{uuid.uuid4().hex}"

        async def _run() -> None:
            reward, weight = await work()
            weight = weight if weight is not None else 1.0
            await self.evaluation_activity(node_key, reward, weight=weight)

        async def _cleanup(success: bool, error: Exception | None) -> None:
            del success, error
            async with busy_lock:
                self._busy_agents.discard(node_key)

        scheduled = await self._scheduler.schedule(task_id, _run, on_complete=_cleanup)
        if not scheduled:
            async with busy_lock:
                self._busy_agents.discard(node_key)
        return scheduled

    async def drain(self) -> None:
        await self._scheduler.wait_for_all()

    # ------------------------------------------------------------------
    # Diagnostic helpers
    @property
    def scheduler(self) -> TaskScheduler:
        return self._scheduler

    async def busy_agents(self) -> Iterable[str]:
        busy_lock = self._busy_guard()
        async with busy_lock:
            return set(self._busy_agents)
