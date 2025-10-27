"""Owner governance utilities giving full control over the fabric."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from .job_models import Shard
from .router import GlobalOrchestrator


@dataclass
class GovernanceSnapshot:
    """Snapshot of owner-configurable parameters for reporting."""

    tick_interval: float
    shard_pauses: Dict[Shard, bool]
    spillover_limits: Dict[Shard, int]
    latency_budgets: Dict[Shard, int]


class OwnerConsole:
    """High-level façade that lets the contract owner steer the fabric."""

    def __init__(self, orchestrator: GlobalOrchestrator) -> None:
        self.orchestrator = orchestrator

    def pause_shard(self, shard: Shard) -> None:
        self.orchestrator.pause_shard(shard)

    def resume_shard(self, shard: Shard) -> None:
        self.orchestrator.resume_shard(shard)

    def pause_all(self) -> None:
        self.orchestrator.pause_all()

    def resume_all(self) -> None:
        self.orchestrator.resume_all()

    def set_tick_interval(self, interval: float) -> None:
        self.orchestrator.set_tick_interval(interval)

    def update_spillover_limit(self, shard: Shard, limit: int) -> None:
        self.orchestrator.router(shard).set_spillover_limit(limit)

    def update_latency_budget(self, shard: Shard, budget_ms: int) -> None:
        self.orchestrator.router(shard).set_latency_budget_fallback(budget_ms)

    def snapshot(self) -> GovernanceSnapshot:
        return GovernanceSnapshot(
            tick_interval=self.orchestrator.tick_interval,
            shard_pauses={shard: router.paused for shard, router in self.orchestrator.routers.items()},
            spillover_limits={
                shard: router.max_spillover_queue for shard, router in self.orchestrator.routers.items()
            },
            latency_budgets={
                shard: router.latency_budget_fallback_ms for shard, router in self.orchestrator.routers.items()
            },
        )

    def serialize(self) -> Dict[str, object]:
        snapshot = self.snapshot()
        return {
            "tick_interval": snapshot.tick_interval,
            "shard_pauses": {shard.value: paused for shard, paused in snapshot.shard_pauses.items()},
            "spillover_limits": {shard.value: limit for shard, limit in snapshot.spillover_limits.items()},
            "latency_budgets": {shard.value: budget for shard, budget in snapshot.latency_budgets.items()},
        }
