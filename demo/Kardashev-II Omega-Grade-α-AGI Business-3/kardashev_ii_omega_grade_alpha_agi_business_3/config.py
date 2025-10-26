"""Configuration primitives for the Omega-grade business demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Dict, Mapping


@dataclass
class ResourceCaps:
    """Planetary resource ceilings expressed in physical units."""

    energy_gw: float = 1_000.0
    compute_pf: float = 100.0
    storage_eb: float = 20.0

    def to_dict(self) -> Mapping[str, float]:
        return {
            "energy_gw": self.energy_gw,
            "compute_pf": self.compute_pf,
            "storage_eb": self.storage_eb,
        }


@dataclass
class DemoConfig:
    """Mutable configuration owned by the operator."""

    owner: str
    default_reward: float = 1_000.0
    stake_ratio: float = 0.1
    validator_count: int = 3
    commit_window: timedelta = timedelta(minutes=5)
    reveal_window: timedelta = timedelta(minutes=5)
    checkpoint_interval: timedelta = timedelta(minutes=10)
    checkpoint_path: str = "omega_demo_checkpoint.json"
    resource_caps: ResourceCaps = field(default_factory=ResourceCaps)

    def snapshot(self) -> Dict[str, Any]:
        return {
            "owner": self.owner,
            "default_reward": self.default_reward,
            "stake_ratio": self.stake_ratio,
            "validator_count": self.validator_count,
            "commit_window_seconds": self.commit_window.total_seconds(),
            "reveal_window_seconds": self.reveal_window.total_seconds(),
            "checkpoint_interval_seconds": self.checkpoint_interval.total_seconds(),
            "checkpoint_path": self.checkpoint_path,
            "resource_caps": self.resource_caps.to_dict(),
        }

    def update(self, *, caller: str, **params: Any) -> None:
        """Update configuration parameters when invoked by the owner."""

        if caller != self.owner:
            raise PermissionError("Only the owner can update the demo configuration")

        for key, value in params.items():
            if not hasattr(self, key):
                raise AttributeError(f"Unknown configuration parameter: {key}")
            if key == "resource_caps" and isinstance(value, Mapping):
                for cap, cap_value in value.items():
                    if hasattr(self.resource_caps, cap):
                        setattr(self.resource_caps, cap, float(cap_value))
                    else:
                        raise AttributeError(f"Unknown resource cap: {cap}")
                continue

            setattr(self, key, value)
