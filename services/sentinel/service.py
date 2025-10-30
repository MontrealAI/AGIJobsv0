"""Sentinel monitoring loop enforcing orchestrator guardrails."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from hgm_core.engine import HGMEngine

from services.alerting import Alert, emit

from .config import SentinelConfig

LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class SentinelEvent:
    kind: str
    agent_key: Optional[str] = None
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SentinelState:
    total_value: float = 0.0
    total_cost: float = 0.0
    roi_breach_count: int = 0
    last_roi: Optional[float] = None
    pause_reasons: set[str] = field(default_factory=set)
    stop_requested: bool = False
    stop_reason: Optional[str] = None
    agent_failures: Dict[str, int] = field(default_factory=dict)
    pruned_agents: set[str] = field(default_factory=set)
    alerts_emitted: set[str] = field(default_factory=set)


@dataclass(slots=True)
class SentinelSnapshot:
    total_value: float
    total_cost: float
    roi: Optional[float]
    pause_reasons: tuple[str, ...]
    stop_requested: bool
    stop_reason: Optional[str]
    pruned_agents: tuple[str, ...]
    roi_breach_count: int


class SentinelMonitor:
    """Asynchronous monitor coordinating sentinel rule evaluation."""

    def __init__(
        self,
        engine: HGMEngine,
        config: SentinelConfig,
    ) -> None:
        self._engine = engine
        self._config = config
        self._queue: asyncio.Queue[SentinelEvent] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None
        self._state = SentinelState()
        self._state_lock = asyncio.Lock()
        self._closed = False

    # ------------------------------------------------------------------
    # Public API
    async def observe_expansion(self, agent_key: str, payload: Dict[str, Any]) -> None:
        """Record an expansion payload for guardrail evaluation."""

        if self._closed:
            return
        self._ensure_task()
        await self._queue.put(SentinelEvent(kind="expansion", agent_key=agent_key, payload=dict(payload)))

    async def observe_evaluation(self, agent_key: str, payload: Dict[str, Any]) -> None:
        """Record an evaluation payload for guardrail evaluation."""

        if self._closed:
            return
        self._ensure_task()
        await self._queue.put(SentinelEvent(kind="evaluation", agent_key=agent_key, payload=dict(payload)))

    async def drain(self) -> None:
        """Wait until all pending events have been processed."""

        await self._queue.join()

    async def close(self) -> None:
        """Stop the monitoring loop gracefully."""

        self._closed = True
        task = self._task
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._task = None

    @property
    def stop_requested(self) -> bool:
        return self._state.stop_requested

    def snapshot(self) -> SentinelSnapshot:
        """Return a read-only snapshot of the sentinel state."""

        state = self._state
        return SentinelSnapshot(
            total_value=state.total_value,
            total_cost=state.total_cost,
            roi=state.last_roi,
            pause_reasons=tuple(sorted(state.pause_reasons)),
            stop_requested=state.stop_requested,
            stop_reason=state.stop_reason,
            pruned_agents=tuple(sorted(state.pruned_agents)),
            roi_breach_count=state.roi_breach_count,
        )

    def is_agent_pruned(self, agent_key: str) -> bool:
        return agent_key in self._state.pruned_agents

    # ------------------------------------------------------------------
    # Internal helpers
    def _ensure_task(self) -> None:
        if self._task is None or self._task.done():
            loop = asyncio.get_running_loop()
            self._task = loop.create_task(self._run_loop(), name="sentinel-monitor")

    async def _run_loop(self) -> None:
        interval = self._config.monitor_interval_seconds
        try:
            while True:
                try:
                    event = await asyncio.wait_for(self._queue.get(), timeout=interval)
                except asyncio.TimeoutError:
                    await self._evaluate_rules()
                    continue
                try:
                    await self._process_event(event)
                finally:
                    self._queue.task_done()
        except asyncio.CancelledError:
            LOGGER.debug("Sentinel monitor cancelled")
            raise

    async def _process_event(self, event: SentinelEvent) -> None:
        if event.kind == "expansion":
            await self._handle_expansion(event)
        elif event.kind == "evaluation":
            await self._handle_evaluation(event)
        else:  # pragma: no cover - defensive
            LOGGER.debug("Unknown sentinel event kind: %s", event.kind)

    async def _handle_expansion(self, event: SentinelEvent) -> None:
        payload = event.payload
        cost = _float(payload.get("cost") or payload.get("spend") or 0.0)
        async with self._state_lock:
            if cost:
                self._state.total_cost += cost
                LOGGER.debug("Recorded expansion cost %.4f (total=%.4f)", cost, self._state.total_cost)
        await self._evaluate_rules()

    async def _handle_evaluation(self, event: SentinelEvent) -> None:
        payload = dict(event.payload)
        reward = _float(payload.get("reward"))
        value = _float(payload.get("value") or payload.get("gmv") or payload.get("revenue"))
        cost = _float(payload.get("cost") or payload.get("spend"))
        success = _bool(payload.get("success"))
        if success is None and reward is not None:
            success = reward >= self._config.success_threshold
        if success is None and value is not None and cost is not None and cost > 0:
            success = value >= cost
        if success is None:
            success = True
        if reward is not None:
            payload["reward"] = reward
        if cost is not None:
            payload["cost"] = cost
        if value is not None:
            payload["value"] = value
        agent = event.agent_key or ""
        async with self._state_lock:
            if cost:
                self._state.total_cost += cost
            if value:
                self._state.total_value += value
            self._state.last_roi = self._compute_roi()
            LOGGER.debug(
                "Evaluation update agent=%s cost=%.4f value=%.4f roi=%s",
                agent,
                cost or 0.0,
                value or 0.0,
                f"{self._state.last_roi:.3f}" if self._state.last_roi is not None else "n/a",
            )
            if agent:
                await self._update_failure_streak(agent, success)
        await self._evaluate_rules()

    async def _update_failure_streak(self, agent: str, success: bool) -> None:
        state = self._state
        if success:
            if self._config.failure_streak.success_reset:
                state.agent_failures[agent] = 0
            else:
                state.agent_failures[agent] = max(0, state.agent_failures.get(agent, 0) - 1)
            return
        failures = state.agent_failures.get(agent, 0) + 1
        state.agent_failures[agent] = failures
        threshold = self._config.failure_streak.threshold
        if failures >= threshold and agent not in state.pruned_agents:
            await self._engine.mark_pruned(agent, reason="failure_streak")
            state.pruned_agents.add(agent)
            await self._schedule_alert(
                severity="critical",
                message=f"Agent {agent} pruned after {failures} consecutive failures",
                reason="failure_streak",
                metadata={"agent": agent, "failures": failures},
            )

    def _compute_roi(self) -> Optional[float]:
        if self._state.total_cost <= 0:
            return None
        return self._state.total_value / self._state.total_cost

    async def _evaluate_rules(self) -> None:
        async with self._state_lock:
            await self._evaluate_roi_locked()
            await self._evaluate_budget_locked()

    async def _evaluate_roi_locked(self) -> None:
        roi = self._compute_roi()
        self._state.last_roi = roi
        if roi is None:
            self._state.roi_breach_count = 0
            await self._clear_pause("roi_floor")
            return
        if roi < self._config.roi_floor:
            self._state.roi_breach_count += 1
            LOGGER.debug(
                "ROI %.3fx below floor %.3fx (%d/%d)",
                roi,
                self._config.roi_floor,
                self._state.roi_breach_count,
                self._config.roi_grace_period,
            )
            if self._state.roi_breach_count >= self._config.roi_grace_period:
                await self._set_pause(
                    "roi_floor",
                    detail=f"ROI {roi:.3f}x below floor {self._config.roi_floor:.3f}x",
                    severity="warning",
                )
        else:
            if self._state.roi_breach_count > 0:
                self._state.roi_breach_count = max(0, self._state.roi_breach_count - 1)
            if self._state.roi_breach_count == 0:
                await self._clear_pause(
                    "roi_floor",
                    detail=f"ROI recovered to {roi:.3f}x (floor {self._config.roi_floor:.3f}x)",
                )

    async def _evaluate_budget_locked(self) -> None:
        cost = self._state.total_cost
        soft = self._config.soft_budget()
        if soft > 0 and cost >= soft:
            await self._set_pause(
                "budget_soft",
                detail=f"Spend {cost:.2f} exceeded soft cap {soft:.2f}",
                severity="warning",
            )
        cap = self._config.budget_cap
        if cap > 0 and cost >= cap and not self._state.stop_requested:
            self._state.stop_requested = True
            self._state.stop_reason = "budget_cap"
            await self._set_pause(
                "budget_stop",
                detail=f"Spend {cost:.2f} reached budget cap {cap:.2f}",
                severity="critical",
            )
            await self._schedule_alert(
                severity="critical",
                message="Sentinel requested orchestration halt due to budget cap",
                reason="budget_cap",
                metadata={"cost": cost, "cap": cap},
            )

    async def _set_pause(self, reason: str, *, detail: str, severity: str) -> None:
        state = self._state
        if reason in state.pause_reasons:
            return
        state.pause_reasons.add(reason)
        await self._engine.set_expansion_gate(False)
        await self._schedule_alert(
            severity=severity,
            message=f"Sentinel paused expansions ({reason})",
            reason=reason,
            metadata={"detail": detail},
        )

    async def _clear_pause(self, reason: str, *, detail: str | None = None) -> None:
        state = self._state
        if reason not in state.pause_reasons:
            return
        state.pause_reasons.discard(reason)
        if not state.pause_reasons and not state.stop_requested:
            await self._engine.set_expansion_gate(True)
        if detail:
            await self._schedule_alert(
                severity="info",
                message=f"Sentinel resumed expansions ({reason})",
                reason=f"{reason}_clear",
                metadata={"detail": detail},
            )

    async def _schedule_alert(self, *, severity: str, message: str, reason: str, metadata: Dict[str, Any]) -> None:
        key = f"{severity}:{reason}:{message}"
        if key in self._state.alerts_emitted and severity != "info":
            return
        if severity != "info":
            self._state.alerts_emitted.add(key)
        if not self._config.alert_channels:
            LOGGER.debug("Alert suppressed because no channels configured: %s", message)
            return
        alert = Alert(source="sentinel", severity=severity, message=message, metadata=dict(metadata))
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(emit(alert), name=f"sentinel-alert-{reason}")
        except RuntimeError:  # pragma: no cover - synchronous fallback
            LOGGER.warning("Alert loop unavailable; emitting synchronously")
            asyncio.run(emit(alert))


def _float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"true", "1", "yes", "on"}:
            return True
        if text in {"false", "0", "no", "off"}:
            return False
    return None


__all__ = ["SentinelMonitor", "SentinelSnapshot"]
