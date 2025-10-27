"""Regional routing services for the planetary fabric."""
from __future__ import annotations

import time
from typing import Dict, List, Tuple

from .job_models import Job, JobResult, Node, Shard
from .node_marketplace import NodeMarketplace
from .shard_registry import MultiShardRegistry


class RegionalRouter:
    """Router dedicated to a specific shard."""

    def __init__(self, shard: Shard, marketplace: NodeMarketplace, registry: MultiShardRegistry) -> None:
        self.shard = shard
        self.marketplace = marketplace
        self.registry = registry
        self.paused = False
        self.max_spillover_queue = 10
        self.latency_budget_fallback_ms = 2000

    def pause(self) -> None:
        self.paused = True

    def resume(self) -> None:
        self.paused = False

    def set_spillover_limit(self, limit: int) -> None:
        self.max_spillover_queue = max(0, limit)

    def set_latency_budget_fallback(self, budget_ms: int) -> None:
        self.latency_budget_fallback_ms = max(10, budget_ms)

    def _eligible_nodes(self) -> List[Node]:
        nodes = [node for node in self.marketplace.list_nodes(self.shard) if node.is_available()]
        nodes.sort(key=lambda node: (node.current_load / max(1, node.capacity), -node.last_heartbeat))
        return nodes

    def dispatch(self) -> List[Tuple[Job, Node, bool]]:
        if self.paused:
            return []
        registry = self.registry.get_registry(self.shard)
        assignments: List[Tuple[Job, Node, bool]] = []
        while True:
            job = registry.next_job()
            if not job:
                break
            nodes = self._eligible_nodes()
            spillover = False
            if not nodes:
                spill_candidates = self.marketplace.best_spillover_nodes(self.shard)
                if spill_candidates and registry.queue_depth() > self.max_spillover_queue:
                    nodes = spill_candidates
                    spillover = True
            if not nodes:
                registry.requeue_job(job)
                break
            assignment = self.marketplace.assign_job(job, nodes, spillover=spillover)
            if assignment:
                registry.mark_running(job.job_id)
                node = self.marketplace.get_node(assignment.node_id)
                if node:
                    assignments.append((job, node, spillover))
            else:
                registry.requeue_job(job)
                break
        return assignments

    def complete_job(self, job: Job, result: JobResult) -> None:
        registry = self.registry.get_registry(self.shard)
        job.result = result
        registry.complete_job(job, latency_ms=max(result.metadata.get("latency_ms", self.latency_budget_fallback_ms), 0))
        self.marketplace.finish_job(job)

    def fail_job(self, job: Job) -> None:
        registry = self.registry.get_registry(self.shard)
        registry.fail_job(job)
        self.marketplace.finish_job(job)


class GlobalOrchestrator:
    """Coordinates all shard routers and marketplace operations."""

    def __init__(self, registry: MultiShardRegistry, marketplace: NodeMarketplace) -> None:
        self.registry = registry
        self.marketplace = marketplace
        self.routers: Dict[Shard, RegionalRouter] = {
            shard: RegionalRouter(shard, marketplace, registry)
            for shard in registry.registries
        }
        self.tick_interval = 0.1
        self.running = False

    def set_tick_interval(self, interval: float) -> None:
        self.tick_interval = max(0.01, interval)

    def router(self, shard: Shard) -> RegionalRouter:
        return self.routers[shard]

    def pause_shard(self, shard: Shard) -> None:
        self.routers[shard].pause()

    def resume_shard(self, shard: Shard) -> None:
        self.routers[shard].resume()

    def pause_all(self) -> None:
        for router in self.routers.values():
            router.pause()

    def resume_all(self) -> None:
        for router in self.routers.values():
            router.resume()

    def run_once(self) -> List[Tuple[Job, Node, bool]]:
        dispatched: List[Tuple[Job, Node, bool]] = []
        for router in self.routers.values():
            dispatched.extend(router.dispatch())
        return dispatched

    def run(self, runtime_seconds: float) -> None:
        self.running = True
        end_time = time.time() + runtime_seconds
        while self.running and time.time() < end_time:
            self.run_once()
            time.sleep(self.tick_interval)

    def stop(self) -> None:
        self.running = False

    def serialize(self) -> Dict[str, object]:
        return {
            "routers": {
                shard.value: {
                    "paused": router.paused,
                    "max_spillover_queue": router.max_spillover_queue,
                    "latency_budget_fallback_ms": router.latency_budget_fallback_ms,
                }
                for shard, router in self.routers.items()
            },
            "tick_interval": self.tick_interval,
        }

    def apply_state(self, state: Dict[str, object]) -> None:
        self.tick_interval = float(state.get("tick_interval", self.tick_interval))
        for shard_name, router_state in dict(state.get("routers", {})).items():
            shard = Shard(shard_name)
            router = self.routers.get(shard)
            if not router:
                continue
            router.paused = bool(router_state.get("paused", False))
            router.max_spillover_queue = int(router_state.get("max_spillover_queue", router.max_spillover_queue))
            router.latency_budget_fallback_ms = int(
                router_state.get("latency_budget_fallback_ms", router.latency_budget_fallback_ms)
            )
