"""Configuration models and helpers for the AGI Alpha Node demo."""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

import yaml
from pydantic import BaseModel, Field, PrivateAttr, validator


class ENSConfig(BaseModel):
    name: str = Field(..., description="ENS name controlling the node")
    operator_address: str = Field(..., description="Ethereum address of the operator")
    provider_url: Optional[str] = Field(None, description="Ethereum JSON-RPC endpoint")
    fallback_registry_file: Optional[str] = Field(
        None,
        description="Local JSON file for offline ENS ownership proofs",
    )


class StakingConfig(BaseModel):
    stake_manager_address: str
    minimum_stake: int = Field(..., ge=0)
    auto_reinvest: bool = True


class JobConfig(BaseModel):
    router_address: str
    registry_address: str
    poll_interval_seconds: int = Field(30, ge=5)
    eligibility_threshold: float = Field(0.5, ge=0.0, le=1.0)


class PlannerConfig(BaseModel):
    horizon: int = Field(5, ge=1)
    exploration_constant: float = Field(1.1, gt=0)
    risk_aversion: float = Field(0.2, ge=0, le=1)
    economic_goal: str = "maximize_compounded_rewards"


class SpecialistConfig(BaseModel):
    name: str
    class_path: str
    capabilities: List[str]

    @validator("class_path")
    def ensure_class_path(cls, value: str) -> str:
        if ":" not in value:
            raise ValueError("class_path must be in the form 'module:Class'")
        return value


class KnowledgeConfig(BaseModel):
    database_path: str
    embedding_dimension: int = Field(16, ge=4, le=512)


class MetricsConfig(BaseModel):
    prometheus_port: int = 9109
    dashboard_port: int = 8080
    log_file: Optional[str] = None


class SafetyConfig(BaseModel):
    enable_automatic_pause: bool = True
    pause_on_failed_ens: bool = True
    pause_on_slash_risk: bool = True
    drill_interval_minutes: int = Field(60, ge=5)


class AlphaNodeConfig(BaseModel):
    ens: ENSConfig
    staking: StakingConfig
    jobs: JobConfig
    planner: PlannerConfig
    specialists: List[SpecialistConfig]
    knowledge_lake: KnowledgeConfig
    metrics: MetricsConfig
    safety: SafetyConfig
    _base_path: Path = PrivateAttr(default=Path("."))

    @classmethod
    def load(cls, path: Path | str) -> "AlphaNodeConfig":
        file_path = Path(path)
        data = yaml.safe_load(file_path.read_text())
        instance = cls.parse_obj(data)
        instance._base_path = file_path.parent.resolve()
        return instance

    def resolved_log_file(self, base_path: Path) -> Optional[Path]:
        if not self.metrics.log_file:
            return None
        return (base_path / self.metrics.log_file).resolve()

    def resolve_path(self, relative: str) -> Path:
        return (self._base_path / relative).resolve()


__all__ = ["AlphaNodeConfig", "ENSConfig", "SafetyConfig"]
