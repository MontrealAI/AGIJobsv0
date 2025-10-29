"""Configuration utilities for the AGI Alpha Node demo."""
from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import yaml


@dataclass(slots=True)
class ContractConfig:
    """Holds addresses and ABIs for core AGI Jobs v2 contracts."""

    name: str
    address: str
    abi_path: pathlib.Path

    def load_abi(self) -> List[Dict[str, Any]]:
        if not self.abi_path.exists():
            raise FileNotFoundError(f"ABI file not found for {self.name}: {self.abi_path}")
        return json.loads(self.abi_path.read_text())


@dataclass(slots=True)
class PlannerConfig:
    horizon: int = 12
    exploration_constant: float = 1.4
    discount_factor: float = 0.97
    max_rollouts: int = 128
    temperature: float = 1.0


@dataclass(slots=True)
class SpecialistConfig:
    name: str
    model_path: Optional[pathlib.Path] = None
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class KnowledgeLakeConfig:
    path: pathlib.Path
    embedding_dim: int = 768
    similarity_threshold: float = 0.76


@dataclass(slots=True)
class MetricsConfig:
    host: str = "0.0.0.0"
    port: int = 9108


@dataclass(slots=True)
class WebConfig:
    host: str = "0.0.0.0"
    port: int = 8080
    enable_https: bool = False
    allowed_origins: List[str] = field(default_factory=lambda: ["*"])


@dataclass(slots=True)
class ComplianceConfig:
    drill_interval_minutes: int = 60
    minimum_stake: int = 1000


@dataclass(slots=True)
class GovernanceConfig:
    governance_address: str
    emergency_pause_address: str
    ens_domain: str


@dataclass(slots=True)
class BlockchainConfig:
    rpc_url: str
    chain_id: int
    contracts: Dict[str, ContractConfig]
    default_gas_limit: int = 3_000_000


@dataclass(slots=True)
class AlphaNodeConfig:
    governance: GovernanceConfig
    blockchain: BlockchainConfig
    planner: PlannerConfig
    specialists: List[SpecialistConfig]
    knowledge_lake: KnowledgeLakeConfig
    metrics: MetricsConfig
    web: WebConfig
    compliance: ComplianceConfig

    @classmethod
    def from_file(cls, path: pathlib.Path) -> "AlphaNodeConfig":
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AlphaNodeConfig":
        def load_contracts(raw_contracts: Dict[str, Any]) -> Dict[str, ContractConfig]:
            contracts: Dict[str, ContractConfig] = {}
            for key, value in raw_contracts.items():
                contracts[key] = ContractConfig(
                    name=value["name"],
                    address=value["address"],
                    abi_path=pathlib.Path(value["abi"]),
                )
            return contracts

        blockchain = BlockchainConfig(
            rpc_url=data["blockchain"]["rpc_url"],
            chain_id=int(data["blockchain"]["chain_id"]),
            contracts=load_contracts(data["blockchain"]["contracts"]),
            default_gas_limit=int(data["blockchain"].get("default_gas_limit", 3_000_000)),
        )

        governance = GovernanceConfig(**data["governance"])
        planner = PlannerConfig(**data["planner"])
        specialists = [SpecialistConfig(**spec) for spec in data["specialists"]]
        knowledge_lake = KnowledgeLakeConfig(path=pathlib.Path(data["knowledge_lake"]["path"]),
                                             embedding_dim=int(data["knowledge_lake"].get("embedding_dim", 768)),
                                             similarity_threshold=float(data["knowledge_lake"].get("similarity_threshold", 0.76)))
        metrics = MetricsConfig(**data["metrics"])
        web = WebConfig(**data["web"])
        compliance = ComplianceConfig(**data["compliance"])

        return cls(
            governance=governance,
            blockchain=blockchain,
            planner=planner,
            specialists=specialists,
            knowledge_lake=knowledge_lake,
            metrics=metrics,
            web=web,
            compliance=compliance,
        )


DEFAULT_CONFIG_PATH = pathlib.Path("config/alpha-node.config.yaml")


def load_config(path: Optional[pathlib.Path] = None) -> AlphaNodeConfig:
    config_path = path or DEFAULT_CONFIG_PATH
    return AlphaNodeConfig.from_file(config_path)


__all__ = [
    "AlphaNodeConfig",
    "BlockchainConfig",
    "ComplianceConfig",
    "ContractConfig",
    "GovernanceConfig",
    "KnowledgeLakeConfig",
    "MetricsConfig",
    "PlannerConfig",
    "SpecialistConfig",
    "WebConfig",
    "load_config",
    "DEFAULT_CONFIG_PATH",
]
