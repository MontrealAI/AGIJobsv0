"""Node marketplace for the Planetary Orchestrator Fabric demo."""
from __future__ import annotations

import time
from typing import Dict, List, Optional, Sequence

from .job_models import Assignment, Job, Node, NodeHealth, Shard


class NodeMarketplace:
    """Registry and scheduler for containerised agent nodes."""

    def __init__(self, heartbeat_timeout: float = 20.0) -> None:
        self._nodes: Dict[str, Node] = {}
        self._assignments: Dict[str, Assignment] = {}
        self.heartbeat_timeout = heartbeat_timeout

    # ------------------------------------------------------------------
    # Registration and discovery
    # ------------------------------------------------------------------
    def register_node(self, node: Node) -> None:
        self._nodes[node.node_id] = node

    def get_node(self, node_id: str) -> Optional[Node]:
        return self._nodes.get(node_id)

    def remove_node(self, node_id: str) -> None:
        self._nodes.pop(node_id, None)
        self._assignments = {
            job_id: assignment
            for job_id, assignment in self._assignments.items()
            if assignment.node_id != node_id
        }

    def list_nodes(self, shard: Optional[Shard] = None) -> List[Node]:
        if shard is None:
            return list(self._nodes.values())
        return [node for node in self._nodes.values() if node.shard == shard]

    # ------------------------------------------------------------------
    # Scheduling helpers
    # ------------------------------------------------------------------
    def assign_job(self, job: Job, candidate_nodes: Sequence[Node], spillover: bool) -> Optional[Assignment]:
        now = time.time()
        matching_nodes = [node for node in candidate_nodes if job.payload.get("skill") in node.specialties]
        pool = list(matching_nodes or candidate_nodes)
        pool = [node for node in pool if node.is_available()]
        if not pool:
            return None
        pool.sort(key=lambda node: (node.current_load / max(node.capacity, 1), node.last_heartbeat))
        node = pool[0]
        node.current_load += 1
        job.assigned_node_id = node.node_id
        if job.status == JobStatus.QUEUED:
            job.status = JobStatus.ASSIGNED
        assignment = Assignment(job_id=job.job_id, node_id=node.node_id, shard=node.shard, assigned_at=now, spillover=spillover)
        self._assignments[job.job_id] = assignment
        return assignment

    def finish_job(self, job: Job) -> None:
        assignment = self._assignments.pop(job.job_id, None)
        if assignment:
            node = self._nodes.get(assignment.node_id)
            if node and node.current_load > 0:
                node.current_load -= 1
        job.assigned_node_id = None

    # ------------------------------------------------------------------
    # Heartbeat and health checks
    # ------------------------------------------------------------------
    def heartbeat(self, node_id: str, health: Optional[NodeHealth] = None) -> None:
        node = self._nodes[node_id]
        node.heartbeat(health)

    def detect_stale_nodes(self) -> List[Node]:
        now = time.time()
        stale: List[Node] = []
        for node in self._nodes.values():
            if now - node.last_heartbeat > self.heartbeat_timeout:
                node.health = NodeHealth.OFFLINE
                stale.append(node)
        return stale

    # ------------------------------------------------------------------
    # Spillover / fallback discovery
    # ------------------------------------------------------------------
    def best_spillover_nodes(self, shard: Shard, limit: int = 3) -> List[Node]:
        candidates = [
            node
            for node in self._nodes.values()
            if node.shard != shard and node.is_available() and node.health == NodeHealth.HEALTHY
        ]
        candidates.sort(key=lambda node: (node.current_load / max(1, node.capacity), node.last_heartbeat))
        return candidates[:limit]

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def serialize(self) -> Dict[str, object]:
        return {
            "nodes": {node_id: node.serialize() for node_id, node in self._nodes.items()},
            "assignments": {job_id: assignment.serialize() for job_id, assignment in self._assignments.items()},
            "heartbeat_timeout": self.heartbeat_timeout,
        }

    @classmethod
    def deserialize(cls, data: Dict[str, object]) -> "NodeMarketplace":
        marketplace = cls(heartbeat_timeout=float(data.get("heartbeat_timeout", 20.0)))
        marketplace._nodes = {
            node_id: Node.deserialize(node_data)
            for node_id, node_data in dict(data.get("nodes", {})).items()
        }
        marketplace._assignments = {
            job_id: Assignment.deserialize(assignment)
            for job_id, assignment in dict(data.get("assignments", {})).items()
        }
        return marketplace


from .job_models import JobStatus  # noqa: E402  # late import to avoid circular dependency
