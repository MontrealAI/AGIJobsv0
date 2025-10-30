"""Configuration management for the AGI Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List
import json
import os

import yaml


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "config.default.yaml"


@dataclass
class GovernanceConfig:
    governance_address: str
    emergency_contact: str
    allowed_operators: List[str]


@dataclass
class BlockchainConfig:
    rpc_url: str
    ens_registry: str
    stake_manager: str
    fee_pool: str
    system_pause: str
    job_router: str
    job_registry: str


@dataclass
class MetricsConfig:
    host: str = "0.0.0.0"
    port: int = 9097
    log_path: Path = Path("logs/alpha-node.log")


@dataclass
class DemoConfig:
    ens_name: str
    operator_address: str
    minimum_stake: int
    governance: GovernanceConfig
    blockchain: BlockchainConfig
    metrics: MetricsConfig = field(default_factory=MetricsConfig)
    knowledge_path: Path = Path("storage/knowledge_lake.sqlite")


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(base)
    for key, value in override.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_config(explicit_path: str | None = None, overrides: Dict[str, Any] | None = None) -> DemoConfig:
    """Load the node configuration from YAML with optional overrides."""
    if not DEFAULT_CONFIG_PATH.exists():
        raise FileNotFoundError(f"Default configuration missing: {DEFAULT_CONFIG_PATH}")

    with DEFAULT_CONFIG_PATH.open("r", encoding="utf-8") as fh:
        base_config = yaml.safe_load(fh) or {}

    if explicit_path:
        explicit = Path(explicit_path)
        if not explicit.exists():
            raise FileNotFoundError(f"Configuration file not found: {explicit}")
        with explicit.open("r", encoding="utf-8") as explicit_fh:
            explicit_config = yaml.safe_load(explicit_fh) or {}
        base_config = _deep_merge(base_config, explicit_config)

    env_override_raw = os.getenv("AGI_ALPHA_NODE_CONFIG_OVERRIDE")
    env_overrides: Dict[str, Any] = json.loads(env_override_raw) if env_override_raw else {}

    merged = _deep_merge(base_config, env_overrides)
    if overrides:
        merged = _deep_merge(merged, overrides)

    governance = GovernanceConfig(**merged["governance"])
    blockchain = BlockchainConfig(**merged["blockchain"])
    metrics_dict = merged.get("metrics", {})
    metrics = MetricsConfig(**metrics_dict)

    knowledge_path = Path(merged.get("knowledge_path", "storage/knowledge_lake.sqlite"))

    return DemoConfig(
        ens_name=merged["ens_name"],
        operator_address=merged["operator_address"],
        minimum_stake=int(merged["minimum_stake"]),
        governance=governance,
        blockchain=blockchain,
        metrics=metrics,
        knowledge_path=knowledge_path,
    )


__all__ = [
    "BlockchainConfig",
    "DemoConfig",
    "GovernanceConfig",
    "MetricsConfig",
    "DEFAULT_CONFIG_PATH",
    "load_config",
]
