from __future__ import annotations

import dataclasses
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping


@dataclass
class AgentConfig:
    name: str
    skills: List[str]
    stake: float
    energy_allowance: float
    compute_allowance: float


@dataclass
class ValidatorConfig:
    quorum: int
    commit_phase_seconds: int
    reveal_phase_seconds: int
    stake_ratio: float
    slash_ratio: float


@dataclass
class SimulationConfig:
    type: str
    initial_energy: float
    initial_compute: float
    initial_gdp: float
    innovation_index: float


@dataclass
class DemoJobConfig:
    title: str
    reward: float
    deadline_hours: float
    energy_budget: float
    compute_budget: float
    description: str
    skills: List[str]


@dataclass
class OmegaConfig:
    log_path: str
    state_path: str
    checkpoint_interval_seconds: int
    max_concurrent_jobs: int
    resource_manager: Mapping[str, Any]
    agents: List[AgentConfig] = field(default_factory=list)
    validators: ValidatorConfig | None = None
    simulation: SimulationConfig | None = None
    demo_jobs: List[DemoJobConfig] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "log_path": self.log_path,
            "state_path": self.state_path,
            "checkpoint_interval_seconds": self.checkpoint_interval_seconds,
            "max_concurrent_jobs": self.max_concurrent_jobs,
            "resource_manager": dict(self.resource_manager),
            "agents": [dataclasses.asdict(agent) for agent in self.agents],
            "validators": dataclasses.asdict(self.validators) if self.validators else None,
            "simulation": dataclasses.asdict(self.simulation) if self.simulation else None,
            "demo_jobs": [dataclasses.asdict(job) for job in self.demo_jobs],
        }


def _parse_agents(data: Iterable[Mapping[str, Any]]) -> List[AgentConfig]:
    agents: List[AgentConfig] = []
    for raw in data:
        agents.append(
            AgentConfig(
                name=str(raw["name"]),
                skills=list(raw.get("skills", [])),
                stake=float(raw.get("stake", 0.0)),
                energy_allowance=float(raw.get("energy_allowance", 0.0)),
                compute_allowance=float(raw.get("compute_allowance", 0.0)),
            )
        )
    return agents


def _parse_demo_jobs(data: Iterable[Mapping[str, Any]]) -> List[DemoJobConfig]:
    jobs: List[DemoJobConfig] = []
    for raw in data:
        jobs.append(
            DemoJobConfig(
                title=str(raw["title"]),
                reward=float(raw["reward"]),
                deadline_hours=float(raw["deadline_hours"]),
                energy_budget=float(raw.get("energy_budget", 0.0)),
                compute_budget=float(raw.get("compute_budget", 0.0)),
                description=str(raw.get("description", "")),
                skills=list(raw.get("skills", [])),
            )
        )
    return jobs


def load_config(path: str | Path) -> OmegaConfig:
    path = Path(path)
    with path.open("r", encoding="utf-8") as fh:
        raw: MutableMapping[str, Any] = json.load(fh)

    validators_cfg = raw.get("validators")
    simulation_cfg = raw.get("simulation")
    return OmegaConfig(
        log_path=str(raw["log_path"]),
        state_path=str(raw["state_path"]),
        checkpoint_interval_seconds=int(raw["checkpoint_interval_seconds"]),
        max_concurrent_jobs=int(raw["max_concurrent_jobs"]),
        resource_manager=dict(raw.get("resource_manager", {})),
        agents=_parse_agents(raw.get("agents", [])),
        validators=ValidatorConfig(**validators_cfg) if validators_cfg else None,
        simulation=SimulationConfig(**simulation_cfg) if simulation_cfg else None,
        demo_jobs=_parse_demo_jobs(raw.get("demo_jobs", [])),
    )


def override_config(base: OmegaConfig, overrides: Mapping[str, Any]) -> OmegaConfig:
    data = base.as_dict()
    data.update(overrides)
    tmp = Path("__tmp_config.json")
    tmp.write_text(json.dumps(data), encoding="utf-8")
    try:
        return load_config(tmp)
    finally:
        tmp.unlink(missing_ok=True)
