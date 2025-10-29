"""Configuration loading utilities for the Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Optional

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
    incentives_address: str
    treasury_address: str
    fee_pool_address: Optional[str] = None
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
class SpecialistConfig:
    domain: str
    name: str
    description: str
    risk_limit: float
    enabled: bool = True


def _default_specialists() -> List[SpecialistConfig]:
    return [
        SpecialistConfig(
            domain="finance",
            name="Finance Strategist",
            description="Compounds AGIALPHA yields via multi-market orchestration.",
            risk_limit=0.3,
        ),
        SpecialistConfig(
            domain="biotech",
            name="Biotech Synthesist",
            description="Designs synthetic biology breakthroughs on demand.",
            risk_limit=0.25,
        ),
        SpecialistConfig(
            domain="manufacturing",
            name="Manufacturing Optimizer",
            description="Builds hyper-efficient supply chains and production lines.",
            risk_limit=0.2,
        ),
    ]


@dataclass
class AlphaNodeConfig:
    identity: IdentityConfig
    security: SecurityConfig
    staking: StakingConfig
    jobs: JobsConfig
    planner: PlannerConfig = field(default_factory=PlannerConfig)
    metrics: MetricsConfig = field(default_factory=MetricsConfig)
    storage: StorageConfig = field(
        default_factory=lambda: StorageConfig(Path("./storage/knowledge.db"), Path("./storage/logs.jsonl"))
    )
    specialists: List[SpecialistConfig] = field(default_factory=_default_specialists)

    @classmethod
    def from_file(cls, path: Path) -> "AlphaNodeConfig":
        data = _load_yaml(path)
        return cls(
            identity=IdentityConfig(**data["identity"]),
            security=SecurityConfig(**data["security"]),
            staking=StakingConfig(
                stake_manager_address=data["staking"]["stake_manager_address"],
                min_stake_wei=int(data["staking"]["min_stake_wei"]),
                incentives_address=data["staking"].get("incentives_address", data["staking"]["stake_manager_address"]),
                treasury_address=data["staking"].get("treasury_address", data["staking"]["stake_manager_address"]),
                fee_pool_address=data["staking"].get("fee_pool_address"),
                reward_tokens=[RewardToken(**token) for token in data["staking"].get("reward_tokens", [])],
            ),
            jobs=JobsConfig(**data["jobs"]),
            planner=PlannerConfig(**data.get("planner", {})),
            metrics=MetricsConfig(**data.get("metrics", {})),
            storage=StorageConfig(
                knowledge_path=Path(data["storage"]["knowledge_path"]).expanduser(),
                logs_path=Path(data["storage"]["logs_path"]).expanduser(),
            ),
            specialists=_load_specialists(data.get("specialists")),
        )

    @classmethod
    def load(cls, path: Path) -> "AlphaNodeConfig":
        return cls.from_file(path)

    @property
    def owner_address(self) -> str:
        return self.identity.operator_address

    @property
    def governance_address(self) -> str:
        return self.identity.governance_address

    @property
    def rpc_url(self) -> str:
        return self.identity.rpc_url

    @property
    def stake_threshold(self) -> int:
        return int(self.staking.min_stake_wei)

    @property
    def planning_horizon(self) -> int:
        return self.planner.search_depth

    @property
    def exploration_bias(self) -> float:
        return self.planner.exploration_constant

    @property
    def job_registry_address(self) -> str:
        return self.jobs.job_router_address

    def enabled_specialists(self) -> Iterable[SpecialistConfig]:
        for specialist in self.specialists:
            if specialist.enabled:
                yield specialist


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


def _load_specialists(raw: Optional[List[dict]]) -> List[SpecialistConfig]:
    if not raw:
        return _default_specialists()
    specialists: List[SpecialistConfig] = []
    for entry in raw:
        try:
            specialists.append(
                SpecialistConfig(
                    domain=entry["domain"],
                    name=entry.get("name", entry["domain"].title()),
                    description=entry.get("description", ""),
                    risk_limit=float(entry.get("risk_limit", 0.3)),
                    enabled=bool(entry.get("enabled", True)),
                )
            )
        except KeyError as exc:  # pragma: no cover - defensive against malformed configs
            raise ValueError(f"Invalid specialist configuration: missing {exc!s}") from exc
    return specialists
