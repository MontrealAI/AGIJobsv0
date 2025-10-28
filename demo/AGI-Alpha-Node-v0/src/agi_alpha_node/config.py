from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

import jsonschema
import yaml


class ConfigError(RuntimeError):
    """Raised when the operator configuration is invalid."""


@dataclass(frozen=True)
class NetworkConfig:
    chain_id: int
    rpc_url: str
    confirmations_required: int
    ens_registry: str


@dataclass(frozen=True)
class OperatorConfig:
    ens_domain: str
    operator_address: str
    governance_address: str
    stake_controller_address: str
    pause_authority_address: str
    contact_email: str


@dataclass(frozen=True)
class WalletConfig:
    keystore_path: Path
    keystore_password_env: str


@dataclass(frozen=True)
class ContractsConfig:
    stake_manager: str
    fee_pool: str
    platform_incentives: str
    job_router: str
    job_registry: str
    identity_registry: str
    platform_registry: str
    system_pause: str


@dataclass(frozen=True)
class StakingConfig:
    minimum_stake: float
    currency_symbol: str
    auto_reinvest: bool


@dataclass
class PlannerConfig:
    horizon: int
    exploration_bias: float
    exploitation_bias: float
    reward_decay: float
    risk_tolerance: float


@dataclass(frozen=True)
class SpecialistConfig:
    enabled: bool


@dataclass(frozen=True)
class SpecialistsConfig:
    finance: SpecialistConfig
    biotech: SpecialistConfig
    manufacturing: SpecialistConfig


@dataclass(frozen=True)
class KnowledgeLakeConfig:
    storage_path: Path
    retention_days: int
    max_entries: int


@dataclass(frozen=True)
class OrchestratorConfig:
    concurrent_jobs: int
    antifragility_interval_minutes: int


@dataclass(frozen=True)
class ObservabilityConfig:
    dashboard_port: int
    metrics_port: int
    log_path: Path


@dataclass(frozen=True)
class ComplianceConfig:
    antifragility_drill_interval_hours: int
    minimum_compliance_score: float


@dataclass(frozen=True)
class SafetyConfig:
    enable_auto_pause: bool
    slashing_threshold: float


@dataclass(frozen=True)
class Config:
    version: int
    network: NetworkConfig
    operator: OperatorConfig
    wallet: WalletConfig
    contracts: ContractsConfig
    staking: StakingConfig
    planner: PlannerConfig
    specialists: SpecialistsConfig
    knowledge_lake: KnowledgeLakeConfig
    orchestrator: OrchestratorConfig
    observability: ObservabilityConfig
    compliance: ComplianceConfig
    safety: SafetyConfig

    def as_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "network": self.network.__dict__,
            "operator": self.operator.__dict__,
            "wallet": {"keystore_path": str(self.wallet.keystore_path), "keystore_password_env": self.wallet.keystore_password_env},
            "contracts": self.contracts.__dict__,
            "staking": {
                "minimum_stake": self.staking.minimum_stake,
                "currency_symbol": self.staking.currency_symbol,
                "auto_reinvest": self.staking.auto_reinvest,
            },
            "planner": self.planner.__dict__,
            "specialists": {
                "finance": self.specialists.finance.__dict__,
                "biotech": self.specialists.biotech.__dict__,
                "manufacturing": self.specialists.manufacturing.__dict__,
            },
            "knowledge_lake": {
                "storage_path": str(self.knowledge_lake.storage_path),
                "retention_days": self.knowledge_lake.retention_days,
                "max_entries": self.knowledge_lake.max_entries,
            },
            "orchestrator": self.orchestrator.__dict__,
            "observability": {
                "dashboard_port": self.observability.dashboard_port,
                "metrics_port": self.observability.metrics_port,
                "log_path": str(self.observability.log_path),
            },
            "compliance": self.compliance.__dict__,
            "safety": self.safety.__dict__,
        }


def _load_schema() -> Dict[str, Any]:
    schema_path = Path(__file__).resolve().parents[2] / "config" / "schema.json"
    with schema_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


_SCHEMA = _load_schema()


def load_config(path: Path) -> Config:
    if not path.exists():
        raise ConfigError(f"Configuration file {path} does not exist")

    with path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)

    try:
        jsonschema.validate(raw, _SCHEMA)
    except jsonschema.ValidationError as exc:  # pragma: no cover - library already tested
        raise ConfigError(f"Invalid configuration: {exc.message}") from exc

    def resolve_path(value: str) -> Path:
        return Path(value).expanduser().resolve()

    return Config(
        version=int(raw["version"]),
        network=NetworkConfig(**raw["network"]),
        operator=OperatorConfig(**raw["operator"]),
        wallet=WalletConfig(
            keystore_path=resolve_path(raw["wallet"]["keystore_path"]),
            keystore_password_env=raw["wallet"]["keystore_password_env"],
        ),
        contracts=ContractsConfig(**raw["contracts"]),
        staking=StakingConfig(
            minimum_stake=float(raw["staking"]["minimum_stake"]),
            currency_symbol=raw["staking"]["currency_symbol"],
            auto_reinvest=bool(raw["staking"]["auto_reinvest"]),
        ),
        planner=PlannerConfig(**raw["planner"]),
        specialists=SpecialistsConfig(
            finance=SpecialistConfig(**raw["specialists"]["finance"]),
            biotech=SpecialistConfig(**raw["specialists"]["biotech"]),
            manufacturing=SpecialistConfig(**raw["specialists"]["manufacturing"]),
        ),
        knowledge_lake=KnowledgeLakeConfig(
            storage_path=resolve_path(raw["knowledge_lake"]["storage_path"]),
            retention_days=int(raw["knowledge_lake"]["retention_days"]),
            max_entries=int(raw["knowledge_lake"]["max_entries"]),
        ),
        orchestrator=OrchestratorConfig(**raw["orchestrator"]),
        observability=ObservabilityConfig(
            dashboard_port=int(raw["observability"]["dashboard_port"]),
            metrics_port=int(raw["observability"]["metrics_port"]),
            log_path=resolve_path(raw["observability"]["log_path"]),
        ),
        compliance=ComplianceConfig(**raw["compliance"]),
        safety=SafetyConfig(**raw["safety"]),
    )
