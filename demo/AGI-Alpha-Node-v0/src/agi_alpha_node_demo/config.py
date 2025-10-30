"""Configuration loading and validation utilities for the AGI Alpha Node demo."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

import yaml
import pydantic
from pydantic import BaseModel, Field

if hasattr(pydantic, "field_validator"):
    field_validator = pydantic.field_validator  # type: ignore[attr-defined]
else:  # pragma: no cover - compatibility path for pydantic v1
    from pydantic import validator as field_validator
from pydantic import BaseModel, Field

try:  # Pydantic v2
    from pydantic import field_validator
except ImportError:  # pragma: no cover - exercised in CI with pydantic v1
    from pydantic import validator as _validator

    def field_validator(*fields, **kwargs):
        """Compatibility shim for Pydantic v1's validator decorator."""

        def decorator(func):
            # When defined for Pydantic v2 we annotate validators as classmethods.
            # The v1 decorator expects a plain function, so unwrap if needed.
            if isinstance(func, classmethod):
                func = func.__func__
            return _validator(*fields, **kwargs)(func)

        return decorator


class ContractConfig(BaseModel):
    """Configuration for a single smart contract binding."""

    address: str = Field(..., description="Ethereum address of the contract")
    abi: str = Field(..., description="Relative path to the contract ABI JSON file")

    @field_validator("address")
    @classmethod
    def validate_address(cls, value: str) -> str:
        if not value.startswith("0x") or len(value) != 42:
            raise ValueError("Contract address must be a 0x-prefixed 20-byte hex string")
        return value.lower()

    @field_validator("abi")
    @classmethod
    def validate_abi(cls, value: str) -> str:
        if not value.endswith(".json"):
            raise ValueError("Contract ABI path must reference a JSON file")
        return value


class PlannerConfig(BaseModel):
    rollout_depth: int = Field(5, ge=1)
    exploration_constant: float = Field(1.4, gt=0)
    simulations: int = Field(32, ge=1)


class MetricsConfig(BaseModel):
    host: str = Field("0.0.0.0")
    port: int = Field(9310, ge=1, le=65535)


class DashboardConfig(BaseModel):
    host: str = Field("127.0.0.1")
    port: int = Field(8080, ge=1, le=65535)


class KnowledgeLakeConfig(BaseModel):
    path: str = Field(..., description="Path to the SQLite knowledge base")

    @property
    def absolute_path(self) -> Path:
        return Path(self.path).expanduser().resolve()


class SpecialistConfig(BaseModel):
    name: str
    module: str


class JobSourceConfig(BaseModel):
    source: str


class AlphaNodeConfig(BaseModel):
    ens_domain: str
    operator_address: str
    governance_address: str
    rpc_url: str
    minimum_stake: str
    system_pause_contract: str
    contracts: Dict[str, ContractConfig]
    knowledge_lake: KnowledgeLakeConfig
    planner: PlannerConfig = PlannerConfig()
    specialists: Iterable[SpecialistConfig]
    metrics: MetricsConfig = MetricsConfig()
    dashboard: DashboardConfig = DashboardConfig()
    jobs: JobSourceConfig

    @field_validator("operator_address", "governance_address", "system_pause_contract")
    @classmethod
    def validate_addresses(cls, value: str) -> str:
        if not value.startswith("0x") or len(value) != 42:
            raise ValueError("Must be a 0x-prefixed 20-byte address")
        return value.lower()


def load_config(path: Optional[str] = None) -> AlphaNodeConfig:
    """Load configuration from YAML and return an AlphaNodeConfig."""

    config_path = Path(path or os.environ.get("AGI_ALPHA_NODE_CONFIG", "config/alpha_node.yml"))
    if not config_path.exists():
        raise FileNotFoundError(
            f"Configuration file '{config_path}' not found. Copy config/alpha_node.example.yml and configure your node."
        )

    with config_path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    return AlphaNodeConfig(**data)


@lru_cache(maxsize=1)
def cached_config(path: Optional[str] = None) -> AlphaNodeConfig:
    """Return a cached configuration instance."""

    return load_config(path)


def resolve_contract_path(base_path: Path, contract: ContractConfig) -> Path:
    """Resolve the absolute path to a contract ABI relative to the demo directory."""

    candidate = base_path / contract.abi
    if not candidate.exists():
        raise FileNotFoundError(f"Contract ABI not found at {candidate}")
    return candidate


def ensure_directories(paths: Iterable[Path]) -> None:
    """Ensure that directories exist for the provided paths."""

    for path in paths:
        if path.suffix:
            path.parent.mkdir(parents=True, exist_ok=True)
        else:
            path.mkdir(parents=True, exist_ok=True)


def load_yaml(path: Path) -> Any:
    """Load YAML data from a file path."""

    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}
