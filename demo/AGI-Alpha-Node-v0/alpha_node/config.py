"""Configuration loading utilities for the Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import yaml


@dataclass
class RewardToken:
    symbol: str
    address: str


@dataclass
class IdentityConfig:
    ens_domain: str
    operator_address: str
    governance_address: str
    rpc_url: str


@dataclass
class SecurityConfig:
    emergency_contact: str
    pause_contract: str


@dataclass
class StakingConfig:
    stake_manager_address: str
    min_stake_wei: int
    reward_tokens: List[RewardToken] = field(default_factory=list)


@dataclass
class JobsConfig:
    job_router_address: str
    poll_interval_seconds: int = 15


@dataclass
class PlannerConfig:
    search_depth: int = 4
    exploration_constant: float = 1.25
    learning_rate: float = 0.1


@dataclass
class MetricsConfig:
    prometheus_port: int = 8788
    dashboard_port: int = 8787


@dataclass
class StorageConfig:
    knowledge_path: Path
    logs_path: Path


@dataclass
class AlphaNodeConfig:
    identity: IdentityConfig
    security: SecurityConfig
    staking: StakingConfig
    jobs: JobsConfig
    planner: PlannerConfig = field(default_factory=PlannerConfig)
    metrics: MetricsConfig = field(default_factory=MetricsConfig)
    storage: StorageConfig = field(default_factory=lambda: StorageConfig(Path("./storage/knowledge.db"), Path("./storage/logs.jsonl")))

    @classmethod
    def from_file(cls, path: Path) -> "AlphaNodeConfig":
        data = _load_yaml(path)
        return cls(
            identity=IdentityConfig(**data["identity"]),
            security=SecurityConfig(**data["security"]),
            staking=StakingConfig(
                stake_manager_address=data["staking"]["stake_manager_address"],
                min_stake_wei=int(data["staking"]["min_stake_wei"]),
                reward_tokens=[RewardToken(**token) for token in data["staking"].get("reward_tokens", [])],
            ),
            jobs=JobsConfig(**data["jobs"]),
            planner=PlannerConfig(**data.get("planner", {})),
            metrics=MetricsConfig(**data.get("metrics", {})),
            storage=StorageConfig(
                knowledge_path=Path(data["storage"]["knowledge_path"]).expanduser(),
                logs_path=Path(data["storage"]["logs_path"]).expanduser(),
            ),
        )


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError("Configuration file must contain a dictionary at the top level")
    return data


def find_config(custom_path: Optional[str] = None) -> AlphaNodeConfig:
    """Resolve configuration path, preferring explicit paths."""
    search_paths = []
    if custom_path:
        search_paths.append(Path(custom_path))
    search_paths.append(Path("config/alpha-node.yaml"))
    search_paths.append(Path("config/example.alpha-node.yaml"))

    for candidate in search_paths:
        if candidate.exists():
            return AlphaNodeConfig.from_file(candidate)

    raise FileNotFoundError("Unable to locate alpha-node configuration file")
