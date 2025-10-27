"""Interactive-style mission configuration builder for non-technical operators."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Optional

from .config import load_config_payload


def _deep_merge(base: MutableMapping[str, Any], updates: Mapping[str, Any]) -> MutableMapping[str, Any]:
    """Recursively merge *updates* into *base* and return *base*."""

    for key, value in updates.items():
        if isinstance(value, Mapping) and isinstance(base.get(key), Mapping):
            _deep_merge(base[key], value)  # type: ignore[index]
        else:
            base[key] = copy.deepcopy(value)
    return base


@dataclass(slots=True)
class WizardProfile:
    """High-level mission profiles surfaced to the non-technical operator."""

    name: str
    description: str
    overrides: Dict[str, Any]


class MissionWizard:
    """Generate tailored mission configuration payloads from operator intent."""

    def __init__(self, template: Dict[str, Any]) -> None:
        self._template = copy.deepcopy(template)
        self._profiles = self._build_profiles()

    @classmethod
    def from_path(cls, path: Path) -> "MissionWizard":
        return cls(load_config_payload(path))

    def presets(self) -> Iterable[str]:
        return self._profiles.keys()

    def generate(
        self,
        preset: str,
        *,
        mission_name: Optional[str] = None,
        mission_hours: Optional[float] = None,
        energy_capacity: Optional[float] = None,
        compute_capacity: Optional[float] = None,
        max_cycles: Optional[int] = None,
        reward_multiplier: Optional[float] = None,
    ) -> Dict[str, Any]:
        base = copy.deepcopy(self._template)
        profile = self._profiles.get(preset) or self._profiles["sovereign"]
        _deep_merge(base, profile.overrides)
        if mission_name:
            base["mission_name"] = mission_name
        if mission_hours is not None:
            base["mission_target_hours"] = float(mission_hours)
        if energy_capacity is not None:
            base["energy_capacity"] = float(energy_capacity)
        if compute_capacity is not None:
            base["compute_capacity"] = float(compute_capacity)
        if max_cycles is not None:
            base["max_cycles"] = int(max_cycles)
        if reward_multiplier is not None and isinstance(base.get("initial_jobs"), list):
            scale = float(reward_multiplier)
            for job in base["initial_jobs"]:
                if isinstance(job, MutableMapping):
                    if "reward_tokens" in job:
                        job["reward_tokens"] = float(job["reward_tokens"]) * scale
                    if "energy_budget" in job:
                        job["energy_budget"] = float(job["energy_budget"]) * scale
                    if "compute_budget" in job:
                        job["compute_budget"] = float(job["compute_budget"]) * scale
        return base

    def summarise(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        jobs = payload.get("initial_jobs") or []
        return {
            "mission_name": payload.get("mission_name"),
            "mission_target_hours": payload.get("mission_target_hours"),
            "energy_capacity": payload.get("energy_capacity"),
            "compute_capacity": payload.get("compute_capacity"),
            "max_cycles": payload.get("max_cycles"),
            "worker_count": len((payload.get("worker_specs") or {})),
            "strategist_count": len((payload.get("strategist_names") or [])),
            "validator_count": len((payload.get("validator_names") or [])),
            "initial_job_count": len(jobs),
        }

    def _build_profiles(self) -> Dict[str, WizardProfile]:
        return {
            "sovereign": WizardProfile(
                name="Sovereign Launch",
                description="Single-operator planetary mission tuned for rapid proof of value.",
                overrides={
                    "mission_target_hours": 18.0,
                    "energy_capacity": 1_200_000.0,
                    "compute_capacity": 4_200_000.0,
                    "worker_specs": {
                        "energy-architect": 1.35,
                        "supply-chain": 1.15,
                        "validator-ops": 1.0,
                    },
                    "strategist_names": ["macro-strategist"],
                    "validator_names": ["validator-1", "validator-2", "validator-3"],
                },
            ),
            "consortium": WizardProfile(
                name="Consortium Expansion",
                description="Multi-agent expansion with extended validation depth and resilience.",
                overrides={
                    "mission_target_hours": 48.0,
                    "energy_capacity": 2_400_000.0,
                    "compute_capacity": 9_500_000.0,
                    "worker_specs": {
                        "energy-architect": 1.5,
                        "supply-chain": 1.25,
                        "validator-ops": 1.05,
                        "planetary-logistics": 1.6,
                        "macro-research": 1.4,
                    },
                    "strategist_names": ["macro-strategist", "cosmic-planner"],
                    "validator_names": [
                        "validator-1",
                        "validator-2",
                        "validator-3",
                        "validator-4",
                    ],
                    "resource_target_utilization": 0.72,
                    "autonomy_price_smoothing": 0.32,
                },
            ),
            "galactic": WizardProfile(
                name="Galactic Vanguard",
                description="Full Ω-grade deployment with deep validator mesh and high autonomy.",
                overrides={
                    "mission_target_hours": 96.0,
                    "energy_capacity": 4_800_000.0,
                    "compute_capacity": 18_000_000.0,
                    "worker_specs": {
                        "energy-architect": 1.65,
                        "supply-chain": 1.35,
                        "validator-ops": 1.1,
                        "planetary-logistics": 1.7,
                        "macro-research": 1.45,
                        "validator-guardian": 1.2,
                        "economy-simulator": 1.3,
                    },
                    "strategist_names": [
                        "macro-strategist",
                        "cosmic-planner",
                        "risk-governor",
                    ],
                    "validator_names": [
                        "validator-1",
                        "validator-2",
                        "validator-3",
                        "validator-4",
                        "validator-5",
                        "validator-6",
                    ],
                    "guardian_interval_seconds": 8.0,
                    "resource_target_utilization": 0.68,
                    "resource_price_floor": 0.3,
                    "resource_price_ceiling": 18.0,
                },
            ),
        }


__all__ = ["MissionWizard", "WizardProfile"]
