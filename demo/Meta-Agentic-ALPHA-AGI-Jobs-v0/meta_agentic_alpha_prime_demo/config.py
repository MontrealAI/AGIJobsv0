"""Configuration helpers for the Meta-Agentic α-AGI Jobs Prime demo."""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Iterable, Mapping, MutableMapping, Optional
import json


@dataclass(frozen=True)
class OwnerControls:
    """Settings that a contract owner can adjust at runtime."""

    paused: bool = False
    max_concurrent_initiatives: int = 5
    risk_limit: float = 0.15
    allowed_domains: tuple[str, ...] = ("finance", "supply_chain", "biotech", "energy")
    governance_delay_hours: int = 6
    audit_required: bool = True

    def update(self, **changes: object) -> "OwnerControls":
        """Return a new instance with updated fields, validating constraints."""
        if "max_concurrent_initiatives" in changes and (
            not isinstance(changes["max_concurrent_initiatives"], int)
            or changes["max_concurrent_initiatives"] < 1
        ):
            raise ValueError("max_concurrent_initiatives must be a positive integer")
        if "risk_limit" in changes and not (0 <= float(changes["risk_limit"]) <= 1):
            raise ValueError("risk_limit must be between 0 and 1 inclusive")
        if "governance_delay_hours" in changes and (
            not isinstance(changes["governance_delay_hours"], int)
            or changes["governance_delay_hours"] < 0
        ):
            raise ValueError("governance_delay_hours must be a non-negative integer")
        if "allowed_domains" in changes:
            domains = tuple(str(domain) for domain in changes["allowed_domains"])
            if not domains:
                raise ValueError("allowed_domains must contain at least one domain")
            changes = {**changes, "allowed_domains": domains}
        return replace(self, **changes)


@dataclass(frozen=True)
class DataPipelineConfig:
    """Configuration for ingestion pipelines across domains."""

    refresh_interval_minutes: int = 15
    anomaly_threshold: float = 0.75
    signal_backlog_size: int = 1024
    enable_web_search: bool = True
    enable_research_crawl: bool = True
    enable_chain_observability: bool = True

    def validate(self) -> None:
        if self.refresh_interval_minutes <= 0:
            raise ValueError("refresh_interval_minutes must be positive")
        if self.anomaly_threshold <= 0:
            raise ValueError("anomaly_threshold must be positive")
        if self.signal_backlog_size < 1:
            raise ValueError("signal_backlog_size must be positive")


@dataclass(frozen=True)
class SimulationConfig:
    """Simulation tuning for the meta-agentic sandbox."""

    horizon_days: int = 14
    monte_carlo_samples: int = 128
    stress_test_shocks: int = 8
    enable_world_model: bool = True
    enable_synthetic_data: bool = True
    enable_counterfactuals: bool = True

    def validate(self) -> None:
        if self.horizon_days <= 0:
            raise ValueError("horizon_days must be positive")
        if self.monte_carlo_samples <= 0:
            raise ValueError("monte_carlo_samples must be positive")
        if self.stress_test_shocks <= 0:
            raise ValueError("stress_test_shocks must be positive")


@dataclass(frozen=True)
class ReportingConfig:
    """Settings controlling how stakeholder friendly outputs are generated."""

    enable_dashboard: bool = True
    enable_mermaid_diagrams: bool = True
    summary_format: str = "markdown"
    attach_playbooks: bool = True
    share_with_validators: bool = True

    def validate(self) -> None:
        allowed_formats = {"markdown", "pdf", "html"}
        if self.summary_format not in allowed_formats:
            raise ValueError(
                f"summary_format must be one of {sorted(allowed_formats)}, "
                f"received {self.summary_format!r}"
            )


@dataclass(frozen=True)
class MetaAgenticConfig:
    """Top level configuration powering the demo orchestrator."""

    owner: OwnerControls = field(default_factory=OwnerControls)
    data_pipeline: DataPipelineConfig = field(default_factory=DataPipelineConfig)
    simulation: SimulationConfig = field(default_factory=SimulationConfig)
    reporting: ReportingConfig = field(default_factory=ReportingConfig)
    enabled_phases: tuple[str, ...] = (
        "identify",
        "out_learn",
        "out_think",
        "out_design",
        "out_strategise",
        "out_execute",
    )

    def validate(self) -> None:
        self.data_pipeline.validate()
        self.simulation.validate()
        self.reporting.validate()
        unknown = set(self.enabled_phases) - {
            "identify",
            "out_learn",
            "out_think",
            "out_design",
            "out_strategise",
            "out_execute",
        }
        if unknown:
            raise ValueError(f"Unsupported phases requested: {sorted(unknown)}")
        if not self.enabled_phases:
            raise ValueError("enabled_phases must contain at least one phase")

    @classmethod
    def from_mapping(cls, mapping: Mapping[str, object]) -> "MetaAgenticConfig":
        """Build a configuration object from a mapping."""
        owner = mapping.get("owner", {})
        data_pipeline = mapping.get("data_pipeline", {})
        simulation = mapping.get("simulation", {})
        reporting = mapping.get("reporting", {})
        enabled_phases = mapping.get("enabled_phases")
        instance = cls(
            owner=OwnerControls(**owner) if isinstance(owner, Mapping) else OwnerControls(),
            data_pipeline=DataPipelineConfig(**data_pipeline)
            if isinstance(data_pipeline, Mapping)
            else DataPipelineConfig(),
            simulation=SimulationConfig(**simulation)
            if isinstance(simulation, Mapping)
            else SimulationConfig(),
            reporting=ReportingConfig(**reporting)
            if isinstance(reporting, Mapping)
            else ReportingConfig(),
            enabled_phases=tuple(enabled_phases) if isinstance(enabled_phases, Iterable) else cls().enabled_phases,
        )
        instance.validate()
        return instance

    @classmethod
    def from_file(cls, path: Path | str) -> "MetaAgenticConfig":
        """Load configuration from a JSON file."""
        data = json.loads(Path(path).read_text())
        if not isinstance(data, Mapping):
            raise TypeError("Configuration file must contain a JSON object")
        return cls.from_mapping(data)

    def to_dict(self) -> MutableMapping[str, object]:
        return {
            "owner": {
                "paused": self.owner.paused,
                "max_concurrent_initiatives": self.owner.max_concurrent_initiatives,
                "risk_limit": self.owner.risk_limit,
                "allowed_domains": list(self.owner.allowed_domains),
                "governance_delay_hours": self.owner.governance_delay_hours,
                "audit_required": self.owner.audit_required,
            },
            "data_pipeline": {
                "refresh_interval_minutes": self.data_pipeline.refresh_interval_minutes,
                "anomaly_threshold": self.data_pipeline.anomaly_threshold,
                "signal_backlog_size": self.data_pipeline.signal_backlog_size,
                "enable_web_search": self.data_pipeline.enable_web_search,
                "enable_research_crawl": self.data_pipeline.enable_research_crawl,
                "enable_chain_observability": self.data_pipeline.enable_chain_observability,
            },
            "simulation": {
                "horizon_days": self.simulation.horizon_days,
                "monte_carlo_samples": self.simulation.monte_carlo_samples,
                "stress_test_shocks": self.simulation.stress_test_shocks,
                "enable_world_model": self.simulation.enable_world_model,
                "enable_synthetic_data": self.simulation.enable_synthetic_data,
                "enable_counterfactuals": self.simulation.enable_counterfactuals,
            },
            "reporting": {
                "enable_dashboard": self.reporting.enable_dashboard,
                "enable_mermaid_diagrams": self.reporting.enable_mermaid_diagrams,
                "summary_format": self.reporting.summary_format,
                "attach_playbooks": self.reporting.attach_playbooks,
                "share_with_validators": self.reporting.share_with_validators,
            },
            "enabled_phases": list(self.enabled_phases),
        }


DEFAULT_CONFIG = MetaAgenticConfig()


def load_default_config(overrides: Optional[Mapping[str, object]] = None) -> MetaAgenticConfig:
    """Load the default configuration optionally applying overrides."""
    base = DEFAULT_CONFIG
    if overrides:
        return MetaAgenticConfig.from_mapping(base.to_dict() | overrides)
    return base

