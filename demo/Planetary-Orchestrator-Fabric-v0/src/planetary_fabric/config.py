"""Configuration helpers for scenario presets."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from .job_models import Shard


@dataclass
class ScenarioConfig:
    name: str
    description: str
    job_count: int
    completion_probability: float
    checkpoint_path: str
    shards: List[Shard]
    duration_seconds: float


DEFAULT_SCENARIOS: Dict[str, ScenarioConfig] = {
    "k2-benchmark": ScenarioConfig(
        name="Kardashev-II Benchmark",
        description="10k job flood across Earth/Luna/Mars showcasing spillover and recovery.",
        job_count=10000,
        completion_probability=0.985,
        checkpoint_path="reports/planetary-fabric/checkpoints/k2-benchmark.json",
        shards=[Shard.EARTH, Shard.LUNA, Shard.MARS],
        duration_seconds=45.0,
    ),
    "resilience-drill": ScenarioConfig(
        name="Resilience Drill",
        description="Simulate orchestrator crash mid-run and resume from checkpoint.",
        job_count=2400,
        completion_probability=0.95,
        checkpoint_path="reports/planetary-fabric/checkpoints/resilience.json",
        shards=[Shard.EARTH, Shard.LUNA, Shard.MARS, Shard.EDGE],
        duration_seconds=25.0,
    ),
    "edge-relief": ScenarioConfig(
        name="Edge Relief Surge",
        description="High-priority humanitarian queue prioritising edge nodes with Helios spillover.",
        job_count=1200,
        completion_probability=0.92,
        checkpoint_path="reports/planetary-fabric/checkpoints/edge-relief.json",
        shards=[Shard.EDGE, Shard.EARTH, Shard.HELIOS],
        duration_seconds=20.0,
    ),
}


def load_scenario(name: str, overrides: Optional[Dict[str, object]] = None) -> ScenarioConfig:
    scenario = DEFAULT_SCENARIOS[name]
    data = scenario.__dict__.copy()
    overrides = overrides or {}
    for key, value in overrides.items():
        if key == "shards":
            data[key] = [Shard(item) for item in value]  # type: ignore[list-item]
        else:
            data[key] = value
    return ScenarioConfig(**data)


def load_custom_config(path: str) -> ScenarioConfig:
    with Path(path).open("r", encoding="utf-8") as fp:
        payload = json.load(fp)
    shards = [Shard(item) for item in payload.get("shards", [shard.value for shard in Shard])]
    return ScenarioConfig(
        name=str(payload.get("name", Path(path).stem)),
        description=str(payload.get("description", "Custom scenario")),
        job_count=int(payload.get("job_count", 1000)),
        completion_probability=float(payload.get("completion_probability", 0.95)),
        checkpoint_path=str(payload.get("checkpoint_path", f"reports/planetary-fabric/checkpoints/{Path(path).stem}.json")),
        shards=shards,
        duration_seconds=float(payload.get("duration_seconds", 30.0)),
    )
