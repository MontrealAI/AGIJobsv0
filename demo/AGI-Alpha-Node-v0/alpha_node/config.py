"""Configuration utilities for the AGI Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import yaml


@dataclass(slots=True)
class SpecialistConfig:
    """Configuration for a specialist agent."""

    name: str
    model: str
    risk_limit: float
    description: str
    enabled: bool = True


@dataclass(slots=True)
class AlphaNodeConfig:
    """Runtime configuration loaded from YAML."""

    ens_domain: str
    owner_address: str
    governance_address: str
    stake_threshold: int
    rpc_url: str
    job_registry_address: str
    stake_manager_address: str
    incentives_address: str
    treasury_address: str
    knowledge_path: Path
    log_path: Path
    metrics_port: int = 9753
    dashboard_port: int = 8088
    job_poll_interval: float = 5.0
    planning_horizon: int = 4
    exploration_bias: float = 1.2
    enable_prometheus: bool = True
    enable_dashboard: bool = True
    specialists: List[SpecialistConfig] = field(default_factory=list)

    @classmethod
    def load(cls, path: Path | str) -> "AlphaNodeConfig":
        """Load configuration from YAML."""

        path = Path(path)
        with path.open("r", encoding="utf-8") as handle:
            payload = yaml.safe_load(handle)
        cls._validate_keys(payload)
        knowledge_path = Path(payload["storage"]["knowledge_lake"])
        log_path = Path(payload["storage"]["log_file"])
        specialists = [
            SpecialistConfig(
                name=item["name"],
                model=item["model"],
                risk_limit=float(item.get("risk_limit", 0.0)),
                description=item.get("description", ""),
                enabled=bool(item.get("enabled", True)),
            )
            for item in payload.get("specialists", [])
        ]
        return cls(
            ens_domain=payload["identity"]["ens_domain"],
            owner_address=payload["identity"]["owner_address"],
            governance_address=payload["governance"]["governance_address"],
            stake_threshold=int(payload["economy"]["stake_threshold"]),
            rpc_url=payload["network"]["rpc_url"],
            job_registry_address=payload["contracts"]["job_registry"],
            stake_manager_address=payload["contracts"]["stake_manager"],
            incentives_address=payload["contracts"]["incentives"],
            treasury_address=payload["contracts"]["treasury"],
            knowledge_path=knowledge_path,
            log_path=log_path,
            metrics_port=int(payload.get("observability", {}).get("metrics_port", 9753)),
            dashboard_port=int(payload.get("observability", {}).get("dashboard_port", 8088)),
            job_poll_interval=float(payload.get("runtime", {}).get("job_poll_interval", 5.0)),
            planning_horizon=int(payload.get("runtime", {}).get("planning_horizon", 4)),
            exploration_bias=float(payload.get("runtime", {}).get("exploration_bias", 1.2)),
            enable_prometheus=bool(payload.get("observability", {}).get("enable_prometheus", True)),
            enable_dashboard=bool(payload.get("observability", {}).get("enable_dashboard", True)),
            specialists=specialists,
        )

    @staticmethod
    def _validate_keys(payload: Dict[str, Any]) -> None:
        required_sections = {
            "identity": {"ens_domain", "owner_address"},
            "governance": {"governance_address"},
            "economy": {"stake_threshold"},
            "network": {"rpc_url"},
            "contracts": {"job_registry", "stake_manager", "incentives", "treasury"},
            "storage": {"knowledge_lake", "log_file"},
        }
        for section, keys in required_sections.items():
            if section not in payload:
                raise ValueError(f"Missing configuration section: {section}")
            missing = keys.difference(payload[section])
            if missing:
                raise ValueError(f"Missing keys {missing} in section {section}")

    def enabled_specialists(self) -> Iterable[SpecialistConfig]:
        return (spec for spec in self.specialists if spec.enabled)


def load_config(path: Path | str) -> AlphaNodeConfig:
    return AlphaNodeConfig.load(path)


__all__ = ["AlphaNodeConfig", "SpecialistConfig", "load_config"]
