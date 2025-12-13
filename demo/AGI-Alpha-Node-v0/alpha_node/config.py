"""Configuration models and loader for the AGI Alpha Node demo.

This module intentionally keeps the parsing logic dependency-free so a
non-technical operator can bootstrap the demo without installing
additional tooling.  Configuration is stored in TOML format to remain
human-readable while providing explicit typing.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import tomllib
from typing import Any


@dataclass(slots=True)
class ENSSettings:
    domain: str
    owner_address: str
    provider_url: str | None = None
    expected_resolver: str | None = None


@dataclass(slots=True)
class GovernanceSettings:
    governance_address: str
    emergency_multisig: str
    auto_transfer_on_boot: bool = True


@dataclass(slots=True)
class StakeSettings:
    asset_symbol: str
    minimum_stake: float
    restake_threshold: float
    reward_address: str


@dataclass(slots=True)
class JobSettings:
    polling_interval_seconds: float
    job_source: Path


@dataclass(slots=True)
class KnowledgeSettings:
    storage_path: Path
    snapshot_interval: int


@dataclass(slots=True)
class MetricsSettings:
    listen_host: str = "0.0.0.0"
    listen_port: int = 9101


@dataclass(slots=True)
class DashboardSettings:
    listen_host: str = "0.0.0.0"
    listen_port: int = 8081


@dataclass(slots=True)
class PlannerSettings:
    horizon: int
    exploration_constant: float
    exploitation_bias: float
    risk_aversion: float


@dataclass(slots=True)
class SpecialistSettings:
    finance_model: str
    biotech_model: str
    manufacturing_model: str


@dataclass(slots=True)
class ComplianceSettings:
    antifragility_target: float
    strategic_alpha_target: float


@dataclass(slots=True)
class AlphaNodeConfig:
    ens: ENSSettings
    governance: GovernanceSettings
    stake: StakeSettings
    jobs: JobSettings
    knowledge: KnowledgeSettings
    metrics: MetricsSettings
    dashboard: DashboardSettings
    planner: PlannerSettings
    specialists: SpecialistSettings
    compliance: ComplianceSettings

    @classmethod
    def load(cls, path: Path) -> "AlphaNodeConfig":
        """Parse a TOML configuration file into an :class:`AlphaNodeConfig`.

        Parameters
        ----------
        path:
            Location of the configuration file.
        """

        config_dir = path.parent

        with path.open("rb") as fh:
            raw = tomllib.load(fh)

        def _require(section: str, key: str) -> Any:
            try:
                return raw[section][key]
            except KeyError as exc:  # pragma: no cover - defensive
                raise KeyError(f"Missing configuration value {section}.{key}") from exc

        job_source = Path(_require("jobs", "job_source")).expanduser()
        if not job_source.is_absolute():
            job_source = (config_dir / job_source).resolve()

        return cls(
            ens=ENSSettings(
                domain=_require("ens", "domain"),
                owner_address=_require("ens", "owner_address"),
                provider_url=raw["ens"].get("provider_url"),
                expected_resolver=raw["ens"].get("expected_resolver"),
            ),
            governance=GovernanceSettings(
                governance_address=_require("governance", "governance_address"),
                emergency_multisig=_require("governance", "emergency_multisig"),
                auto_transfer_on_boot=raw["governance"].get("auto_transfer_on_boot", True),
            ),
            stake=StakeSettings(
                asset_symbol=_require("stake", "asset_symbol"),
                minimum_stake=float(_require("stake", "minimum_stake")),
                restake_threshold=float(_require("stake", "restake_threshold")),
                reward_address=_require("stake", "reward_address"),
            ),
            jobs=JobSettings(
                polling_interval_seconds=float(
                    _require("jobs", "polling_interval_seconds")
                ),
                job_source=job_source,
            ),
            knowledge=KnowledgeSettings(
                storage_path=Path(_require("knowledge", "storage_path")).expanduser(),
                snapshot_interval=int(_require("knowledge", "snapshot_interval")),
            ),
            metrics=MetricsSettings(
                listen_host=raw["metrics"].get("listen_host", "0.0.0.0"),
                listen_port=int(raw["metrics"].get("listen_port", 9101)),
            ),
            dashboard=DashboardSettings(
                listen_host=raw["dashboard"].get("listen_host", "0.0.0.0"),
                listen_port=int(raw["dashboard"].get("listen_port", 8081)),
            ),
            planner=PlannerSettings(
                horizon=int(_require("planner", "horizon")),
                exploration_constant=float(
                    raw["planner"].get("exploration_constant", 1.41)
                ),
                exploitation_bias=float(raw["planner"].get("exploitation_bias", 1.0)),
                risk_aversion=float(raw["planner"].get("risk_aversion", 0.25)),
            ),
            specialists=SpecialistSettings(
                finance_model=_require("specialists", "finance_model"),
                biotech_model=_require("specialists", "biotech_model"),
                manufacturing_model=_require(
                    "specialists", "manufacturing_model"
                ),
            ),
            compliance=ComplianceSettings(
                antifragility_target=float(
                    raw["compliance"].get("antifragility_target", 0.75)
                ),
                strategic_alpha_target=float(
                    raw["compliance"].get("strategic_alpha_target", 0.8)
                ),
            ),
        )


__all__ = ["AlphaNodeConfig"]
