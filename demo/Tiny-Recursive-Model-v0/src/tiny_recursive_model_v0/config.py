"""Configuration models and loader for the Tiny Recursive Model demo."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

import yaml


@dataclass
class OwnerConfig:
    """Represents the governance owner controls."""

    address: str
    name: str


@dataclass
class ThermostatConfig:
    target_roi: float
    window: int
    min_inner_cycles: int
    max_inner_cycles: int
    min_outer_steps: int
    max_outer_steps: int
    min_halt_threshold: float
    max_halt_threshold: float
    min_concurrency: int
    max_concurrency: int


@dataclass
class SentinelConfig:
    min_roi: float
    max_daily_cost: float
    max_latency_ms: int
    max_total_cycles: int
    failure_backoff_limit: int


@dataclass
class LedgerConfig:
    value_per_success: float
    base_compute_cost: float
    cost_per_cycle: float
    daily_budget: float


@dataclass
class TrmConfig:
    input_dim: int
    latent_dim: int
    hidden_dim: int
    output_dim: int
    inner_cycles: int
    outer_steps: int
    halt_threshold: float
    max_cycles: int
    ema_decay: float
    learning_rate: float
    weight_decay: float
    batch_size: int
    epochs: int
    device: str


@dataclass
class TelemetryConfig:
    enable_structured_logs: bool
    write_path: str


@dataclass
class EthereumConfig:
    rpc_url: str
    chain_id: int
    logging_contract: str
    confirmations_required: int


@dataclass
class DemoConfig:
    """Top level configuration for the demo."""

    owner: OwnerConfig
    thermostat: ThermostatConfig
    sentinel: SentinelConfig
    ledger: LedgerConfig
    trm: TrmConfig
    telemetry: TelemetryConfig
    ethereum: EthereumConfig

    @classmethod
    def load(cls, path: Path | str) -> "DemoConfig":
        """Load configuration from YAML file."""

        with Path(path).open("r", encoding="utf-8") as handle:
            payload: Dict[str, Any] = yaml.safe_load(handle)
        return cls(
            owner=OwnerConfig(**payload["owner"]),
            thermostat=ThermostatConfig(**payload["thermostat"]),
            sentinel=SentinelConfig(**payload["sentinel"]),
            ledger=LedgerConfig(**payload["ledger"]),
            trm=TrmConfig(**payload["trm"]),
            telemetry=TelemetryConfig(**payload["telemetry"]),
            ethereum=EthereumConfig(**payload["ethereum"]),
        )

    def dump(self, path: Path | str) -> None:
        """Persist configuration back to YAML."""

        path_obj = Path(path)
        path_obj.parent.mkdir(parents=True, exist_ok=True)
        payload: Dict[str, Any] = {
            "owner": self.owner.__dict__,
            "thermostat": self.thermostat.__dict__,
            "sentinel": self.sentinel.__dict__,
            "ledger": self.ledger.__dict__,
            "trm": self.trm.__dict__,
            "telemetry": self.telemetry.__dict__,
            "ethereum": self.ethereum.__dict__,
        }
        with path_obj.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(payload, handle, sort_keys=False)


__all__ = [
    "DemoConfig",
    "EthereumConfig",
    "LedgerConfig",
    "OwnerConfig",
    "SentinelConfig",
    "ThermostatConfig",
    "TelemetryConfig",
    "TrmConfig",
]
