from __future__ import annotations

import dataclasses
import json
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


@dataclass(slots=True)
class NetworkConfig:
    chain_id: int
    rpc_url: str
    ens_domain: str


@dataclass(slots=True)
class GovernanceConfig:
    owner_address: str
    governance_address: str


@dataclass(slots=True)
class StakingConfig:
    required_stake: int
    slashing_threshold: int


@dataclass(slots=True)
class KnowledgeLakeConfig:
    database: str


@dataclass(slots=True)
class PlannerConfig:
    search_depth: int
    num_simulations: int
    exploration_constant: float


@dataclass(slots=True)
class MetricsConfig:
    port: int


@dataclass(slots=True)
class SafetyConfig:
    automated_drills_interval_seconds: int


@dataclass(slots=True)
class LoggingConfig:
    log_dir: str
    log_level: str


@dataclass(slots=True)
class JobsConfig:
    poll_interval_seconds: int


@dataclass(slots=True)
class WebConfig:
    dashboards_enabled: bool


@dataclass(slots=True)
class AppConfig:
    network: NetworkConfig
    governance: GovernanceConfig
    staking: StakingConfig
    knowledge_lake: KnowledgeLakeConfig
    planner: PlannerConfig
    metrics: MetricsConfig
    safety: SafetyConfig
    logging: LoggingConfig
    jobs: JobsConfig
    web: WebConfig


def _decode_int(value: str | int) -> int:
    if isinstance(value, int):
        return value
    return int(value, 10)


def _load_section(data: Dict[str, Any], key: str, model: type) -> Any:
    section = data.get(key)
    if section is None:
        raise KeyError(f"Missing configuration section: {key}")
    return model(**section)


def load_config(path: str | Path) -> AppConfig:
    with open(path, "rb") as fh:
        raw = tomllib.load(fh)

    raw.setdefault("staking", {})
    if "required_stake" in raw["staking"]:
        raw["staking"]["required_stake"] = _decode_int(raw["staking"]["required_stake"])
    if "slashing_threshold" in raw["staking"]:
        raw["staking"]["slashing_threshold"] = _decode_int(raw["staking"]["slashing_threshold"])

    config = AppConfig(
        network=_load_section(raw, "network", NetworkConfig),
        governance=_load_section(raw, "governance", GovernanceConfig),
        staking=_load_section(raw, "staking", StakingConfig),
        knowledge_lake=_load_section(raw, "knowledge_lake", KnowledgeLakeConfig),
        planner=_load_section(raw, "planner", PlannerConfig),
        metrics=_load_section(raw, "metrics", MetricsConfig),
        safety=_load_section(raw, "safety", SafetyConfig),
        logging=_load_section(raw, "logging", LoggingConfig),
        jobs=_load_section(raw, "jobs", JobsConfig),
        web=_load_section(raw, "web", WebConfig),
    )
    return config


def dump_config(config: AppConfig) -> str:
    def serialize(obj: Any) -> Any:
        if dataclasses.is_dataclass(obj):
            return {key: serialize(value) for key, value in dataclasses.asdict(obj).items()}
        if isinstance(obj, Path):
            return str(obj)
        return obj

    return json.dumps(serialize(config), indent=2)


__all__ = [
    "AppConfig",
    "GovernanceConfig",
    "JobsConfig",
    "KnowledgeLakeConfig",
    "LoggingConfig",
    "MetricsConfig",
    "NetworkConfig",
    "PlannerConfig",
    "SafetyConfig",
    "StakingConfig",
    "WebConfig",
    "dump_config",
    "load_config",
]
