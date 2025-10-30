"""Configuration models and loaders for the AGI Alpha Node demo."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Iterable, List, Optional

from .utils import read_yaml


@dataclass
class NetworkConfig:
    chain_endpoint: str
    chain_id: int
    ens_registry: str


@dataclass
class OperatorConfig:
    owner_address: str
    governance_address: str
    ens_domain: str
    pause_key_path: str


@dataclass
class StakingConfig:
    minimum_stake: Decimal
    current_stake: Decimal
    token_symbol: str


@dataclass
class KnowledgeLakeConfig:
    database_path: str


@dataclass
class MetricsConfig:
    bind_host: str
    bind_port: int


@dataclass
class SafetyConfig:
    auto_pause_on_failure: bool
    invariant_checks: Iterable[str]


@dataclass
class PlannerConfig:
    rollout_depth: int
    simulations: int
    discount: float
    exploration_constant: float


@dataclass
class SpecialistConfig:
    name: str
    risk_tolerance: Optional[float] = None
    synthesis_budget: Optional[float] = None
    optimisation_level: Optional[str] = None


@dataclass
class JobsConfig:
    default_reinvestment_rate: float
    heartbeat_seconds: int


@dataclass
class AlphaNodeConfig:
    network: NetworkConfig
    operator: OperatorConfig
    staking: StakingConfig
    knowledge_lake: KnowledgeLakeConfig
    metrics: MetricsConfig
    safety: SafetyConfig
    planner: PlannerConfig
    specialists: List[SpecialistConfig]
    jobs: JobsConfig

    @property
    def knowledge_db_path(self) -> Path:
        return Path(self.knowledge_lake.database_path)


class ConfigValidationError(RuntimeError):
    """Raised when the configuration file does not pass validation."""


REQUIRED_INVARIANTS = {"ens_verified", "stake_sufficient", "governance_configured"}


def load_config(path: Path) -> AlphaNodeConfig:
    raw = read_yaml(path)
    try:
        config = AlphaNodeConfig(
            network=NetworkConfig(**raw["network"]),
            operator=OperatorConfig(**raw["operator"]),
            staking=StakingConfig(
                minimum_stake=Decimal(str(raw["staking"]["minimum_stake"])),
                current_stake=Decimal(str(raw["staking"]["current_stake"])),
                token_symbol=raw["staking"]["token_symbol"],
            ),
            knowledge_lake=KnowledgeLakeConfig(**raw["knowledge_lake"]),
            metrics=MetricsConfig(**raw["metrics"]),
            safety=SafetyConfig(
                auto_pause_on_failure=raw["safety"]["auto_pause_on_failure"],
                invariant_checks=raw["safety"].get("invariant_checks", []),
            ),
            planner=PlannerConfig(**raw["planner"]),
            specialists=[SpecialistConfig(**entry) for entry in raw.get("specialists", [])],
            jobs=JobsConfig(**raw["jobs"]),
        )
    except KeyError as exc:
        raise ConfigValidationError(f"Missing configuration key: {exc}") from exc

    _validate_config(config)
    return config


def _validate_config(config: AlphaNodeConfig) -> None:
    missing_invariants = REQUIRED_INVARIANTS.difference(set(config.safety.invariant_checks))
    if missing_invariants:
        raise ConfigValidationError(
            "Configuration must include invariant checks for: "
            + ", ".join(sorted(missing_invariants))
        )

    if config.staking.current_stake < config.staking.minimum_stake:
        raise ConfigValidationError(
            "Current stake is below the minimum activation threshold"
        )

    if not config.operator.ens_domain.endswith(".agi.eth"):
        raise ConfigValidationError("ENS domain must be within the agi.eth hierarchy")
