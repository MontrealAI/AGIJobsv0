"""Configuration management for the AGI Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List


@dataclass
class GovernanceConfig:
    """Settings that empower the operator with total control."""

    owner_address: str
    governance_address: str
    emergency_contacts: List[str] = field(default_factory=list)
    pause_enabled: bool = True


@dataclass
class EconomyConfig:
    """Configuration for staking, rewards, and reinvestment policies."""

    token_symbol: str = "AGIALPHA"
    minimum_stake: float = 100_000.0
    reinvestment_ratio: float = 0.65
    reward_check_interval_seconds: int = 15


@dataclass
class IntelligenceConfig:
    """Planner and specialist tuning knobs."""

    planner_rollouts: int = 16
    planner_depth: int = 4
    exploration_weight: float = 1.5
    planning_interval_seconds: int = 10
    specialist_parallelism: int = 3


@dataclass
class KnowledgeConfig:
    """Long-term memory persistence settings."""

    storage_path: Path = Path("knowledge_lake.json")
    max_entries: int = 10_000


@dataclass
class MetricsConfig:
    """Observability configuration for Prometheus-compatible metrics."""

    host: str = "0.0.0.0"
    port: int = 9404


@dataclass
class ComplianceConfig:
    """Safety and compliance policies."""

    drill_interval_seconds: int = 60
    compliance_threshold: float = 0.85


@dataclass
class AlphaNodeConfig:
    """Top-level configuration for the demo."""

    ens_domain: str
    operator_address: str
    governance: GovernanceConfig
    economy: EconomyConfig = field(default_factory=EconomyConfig)
    intelligence: IntelligenceConfig = field(default_factory=IntelligenceConfig)
    knowledge: KnowledgeConfig = field(default_factory=KnowledgeConfig)
    metrics: MetricsConfig = field(default_factory=MetricsConfig)
    compliance: ComplianceConfig = field(default_factory=ComplianceConfig)
    metadata: Dict[str, str] = field(default_factory=dict)


def load_demo_config() -> AlphaNodeConfig:
    """Return a rich default configuration suitable for the demo environment."""

    return AlphaNodeConfig(
        ens_domain="agi-alpha-node-demo.alpha.node.agi.eth",
        operator_address="0xALPHADEMO",
        governance=GovernanceConfig(
            owner_address="0xALPHADEMO",
            governance_address="0xGOVERNANCE",
            emergency_contacts=["ops@agi.alpha"],
        ),
        metadata={
            "mission": "Demonstrate institutional-grade autonomous wealth creation.",
            "version": "v0.1.0",
        },
    )
