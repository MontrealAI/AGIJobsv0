"""Node (agent) management for the Planetary Orchestrator Fabric."""
from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .config import NodeConfig
from .jobs import Job


class NodeOfflineError(RuntimeError):
    """Raised when a node becomes unavailable mid-execution."""


@dataclass
class Node:
    """Represents a containerized AI agent available for jobs."""

    config: NodeConfig
    last_heartbeat: float = field(default_factory=lambda: time.monotonic())
    online: bool = True

    async def process(self, job: Job) -> Dict[str, str]:
        """Simulate job execution."""

        if not self.online:
            raise NodeOfflineError(f"Node {self.config.node_id} offline")

        self.last_heartbeat = time.monotonic()
        await asyncio.sleep(self.config.processing_delay)

        if random.random() < self.config.failure_rate:
            self.online = False
            raise NodeOfflineError(f"Node {self.config.node_id} failed mid-task")

        # create deterministic result for reproducibility
        result = {
            "node": self.config.node_id,
            "region": self.config.region,
            "capabilities": ",".join(self.config.capabilities),
            "summary": f"Job {job.job_id} executed at shard {job.region}",
        }
        return result

    def heartbeat(self) -> bool:
        """Return True if the node reports as healthy."""

        if not self.online:
            return False
        now = time.monotonic()
        healthy = now - self.last_heartbeat < 2.0
        if healthy:
            self.last_heartbeat = now
        else:
            self.online = False
        return healthy

    def revive(self) -> None:
        self.online = True
        self.last_heartbeat = time.monotonic()


class NodeRegistry:
    """Tracks active nodes across the planetary fabric."""

    def __init__(self) -> None:
        self._nodes: Dict[str, Node] = {}
        self._by_region: Dict[str, List[str]] = {}
        self._lock = asyncio.Lock()

    async def register(self, config: NodeConfig) -> Node:
        async with self._lock:
            node = Node(config=config)
            self._nodes[config.node_id] = node
            self._by_region.setdefault(config.region, []).append(config.node_id)
            return node

    async def unregister(self, node_id: str) -> None:
        async with self._lock:
            node = self._nodes.pop(node_id, None)
            if node is None:
                return
            region_nodes = self._by_region.get(node.config.region)
            if region_nodes and node_id in region_nodes:
                region_nodes.remove(node_id)

    async def nodes_for_region(self, region: str) -> List[Node]:
        async with self._lock:
            ids = list(self._by_region.get(region, []))
        return [self._nodes[i] for i in ids if i in self._nodes]

    async def all_nodes(self) -> List[Node]:
        async with self._lock:
            return list(self._nodes.values())

    async def get(self, node_id: str) -> Optional[Node]:
        async with self._lock:
            return self._nodes.get(node_id)


__all__ = ["Node", "NodeRegistry", "NodeOfflineError"]
