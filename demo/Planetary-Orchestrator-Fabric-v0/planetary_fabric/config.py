"""Configuration objects for the Planetary Orchestrator Fabric demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Sequence


@dataclass(frozen=True)
class RegionConfig:
    """Configuration for a single shard/region."""

    name: str
    max_queue: int = 0
    spillover_threshold: int = 200


@dataclass(frozen=True)
class NodeConfig:
    """Definition of a worker node that can process jobs."""

    node_id: str
    region: str
    capacity: int
    capabilities: Sequence[str]
    failure_rate: float = 0.0
    processing_delay: float = 0.0005


@dataclass
class CheckpointConfig:
    """Settings that control checkpoint persistence."""

    directory: Path
    interval_seconds: float = 0.5

    def resolve_path(self) -> Path:
        self.directory.mkdir(parents=True, exist_ok=True)
        return self.directory / "checkpoint.json"


@dataclass
class SimulationConfig:
    """Aggregate configuration for the demo simulation."""

    regions: Sequence[RegionConfig]
    nodes: Sequence[NodeConfig]
    checkpoint: CheckpointConfig
    rebalance_interval: float = 0.2
    heartbeat_interval: float = 0.1
    kill_after_seconds: float = 1.5

    @classmethod
    def demo(cls, base_dir: Path) -> "SimulationConfig":
        """Return the default configuration used by the runnable demo."""

        regions = [
            RegionConfig(name="Earth", spillover_threshold=400),
            RegionConfig(name="Luna", spillover_threshold=400),
            RegionConfig(name="Mars", spillover_threshold=400),
        ]
        nodes: List[NodeConfig] = [
            NodeConfig(
                node_id="earth-alpha",
                region="Earth",
                capacity=64,
                capabilities=["general", "helios-gpu"],
                failure_rate=0.0002,
            ),
            NodeConfig(
                node_id="earth-beta",
                region="Earth",
                capacity=64,
                capabilities=["general", "data"],
                failure_rate=0.0001,
            ),
            NodeConfig(
                node_id="luna-analytics",
                region="Luna",
                capacity=48,
                capabilities=["analytics", "logistics"],
                failure_rate=0.0001,
            ),
            NodeConfig(
                node_id="mars-outpost",
                region="Mars",
                capacity=48,
                capabilities=["science", "data"],
                failure_rate=0.001,
            ),
            NodeConfig(
                node_id="mars-relay",
                region="Mars",
                capacity=32,
                capabilities=["relay", "logistics"],
                failure_rate=0.0001,
            ),
        ]
        checkpoint = CheckpointConfig(directory=base_dir / "checkpoints")
        return cls(
            regions=regions,
            nodes=nodes,
            checkpoint=checkpoint,
            rebalance_interval=0.25,
            heartbeat_interval=0.2,
            kill_after_seconds=2.0,
        )


@dataclass
class DemoJobPayload:
    """Represents a human-friendly description of a task."""

    description: str
    complexity: str = "medium"
    reward: str = "5.0 ETH"
    metadata: Dict[str, str] = field(default_factory=dict)


__all__ = [
    "RegionConfig",
    "NodeConfig",
    "CheckpointConfig",
    "SimulationConfig",
    "DemoJobPayload",
]
