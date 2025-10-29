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
class ModelConfig:
    """Shape and capacity knobs for the tiny recursive network."""

    input_dim: int
    latent_dim: int
    hidden_dim: int
    output_dim: int


@dataclass
class RecursionConfig:
    """Controls for the inner (n) and outer (T) loops."""

    inner_cycles: int
    outer_steps: int
    max_cycles: int


@dataclass
class OptimizerConfig:
    learning_rate: float
    weight_decay: float


@dataclass
class TrainingConfig:
    batch_size: int
    epochs: int


@dataclass
class DeviceConfig:
    device: str


@dataclass
class RoiConfig:
    halt_threshold: float


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

    # Derived structured knobs populated in __post_init__.
    model: ModelConfig | None = None
    recursion: RecursionConfig | None = None
    optimizer: OptimizerConfig | None = None
    training: TrainingConfig | None = None
    runtime_device: DeviceConfig | None = None
    roi: RoiConfig | None = None

    def __post_init__(self) -> None:
        # Legacy inline constructor path keeps working by hydrating the
        # structured knobs that Streamlit/CLI consumers can introspect.
        if self.model is None:
            self.model = ModelConfig(
                input_dim=self.input_dim,
                latent_dim=self.latent_dim,
                hidden_dim=self.hidden_dim,
                output_dim=self.output_dim,
            )
        if self.recursion is None:
            self.recursion = RecursionConfig(
                inner_cycles=self.inner_cycles,
                outer_steps=self.outer_steps,
                max_cycles=self.max_cycles,
            )
        if self.optimizer is None:
            self.optimizer = OptimizerConfig(
                learning_rate=self.learning_rate,
                weight_decay=self.weight_decay,
            )
        if self.training is None:
            self.training = TrainingConfig(batch_size=self.batch_size, epochs=self.epochs)
        if self.runtime_device is None:
            self.runtime_device = DeviceConfig(device=self.device)
        if self.roi is None:
            self.roi = RoiConfig(halt_threshold=self.halt_threshold)

    # Convenient accessors so legacy code can keep using flat attributes.
    @property
    def device_target(self) -> str:
        return self.runtime_device.device

    @property
    def halt_threshold_value(self) -> float:
        return self.roi.halt_threshold

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "TrmConfig":
        """Instantiate a TRM config from either flat or structured payloads."""

        if "model" in payload:
            model = ModelConfig(**payload["model"])
            recursion = RecursionConfig(**payload["recursion"])
            optimizer = OptimizerConfig(**payload["optimizer"])
            training = TrainingConfig(**payload["training"])
            device = DeviceConfig(**payload["device"])
            roi = RoiConfig(**payload["roi"])
            return cls(
                input_dim=model.input_dim,
                latent_dim=model.latent_dim,
                hidden_dim=model.hidden_dim,
                output_dim=model.output_dim,
                inner_cycles=recursion.inner_cycles,
                outer_steps=recursion.outer_steps,
                halt_threshold=roi.halt_threshold,
                max_cycles=recursion.max_cycles,
                ema_decay=payload["ema_decay"],
                learning_rate=optimizer.learning_rate,
                weight_decay=optimizer.weight_decay,
                batch_size=training.batch_size,
                epochs=training.epochs,
                device=device.device,
                model=model,
                recursion=recursion,
                optimizer=optimizer,
                training=training,
                runtime_device=device,
                roi=roi,
            )
        return cls(**payload)

    @classmethod
    def load(cls, path: Path | str) -> "TrmConfig":
        with Path(path).open("r", encoding="utf-8") as handle:
            payload: Dict[str, Any] = yaml.safe_load(handle)
        return cls.from_dict(payload)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize configuration for persistence."""

        return {
            "model": self.model.__dict__ if self.model else {},
            "recursion": self.recursion.__dict__ if self.recursion else {},
            "optimizer": self.optimizer.__dict__ if self.optimizer else {},
            "training": self.training.__dict__ if self.training else {},
            "device": self.runtime_device.__dict__ if self.runtime_device else {},
            "roi": self.roi.__dict__ if self.roi else {},
            "ema_decay": self.ema_decay,
        }


@dataclass
class TelemetryConfig:
    enable_structured_logs: bool
    write_path: str


@dataclass
class ReportConfig:
    path: str


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
    report: ReportConfig

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
            trm=TrmConfig.from_dict(payload["trm"]),
            telemetry=TelemetryConfig(**payload["telemetry"]),
            ethereum=EthereumConfig(**payload["ethereum"]),
            report=ReportConfig(**payload.get("report", {"path": "demo/Tiny-Recursive-Model-v0/assets/trm_executive_report.md"})),
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
            "trm": self.trm.to_dict(),
            "telemetry": self.telemetry.__dict__,
            "ethereum": self.ethereum.__dict__,
            "report": self.report.__dict__,
        }
        with path_obj.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(payload, handle, sort_keys=False)


__all__ = [
    "DemoConfig",
    "DeviceConfig",
    "EthereumConfig",
    "LedgerConfig",
    "OwnerConfig",
    "ModelConfig",
    "OptimizerConfig",
    "RecursionConfig",
    "RoiConfig",
    "SentinelConfig",
    "ThermostatConfig",
    "TelemetryConfig",
    "ReportConfig",
    "TrainingConfig",
    "TrmConfig",
]
