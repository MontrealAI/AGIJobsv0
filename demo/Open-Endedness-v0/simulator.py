"""Business funnel simulator used by the Open-Endedness demo."""
from __future__ import annotations

import csv
import json
import pathlib
import random
import sys
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Mapping, Sequence

CURRENT_DIR = pathlib.Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from engine import OmniConfig, OmniCurriculumEngine  # type: ignore
from interestingness import OracleFactory  # type: ignore
from sentinels import SentinelConfig, SentinelController  # type: ignore
from thermostat import ThermostatConfig, ThermostatController  # type: ignore


@dataclass
class TaskConfig:
    task_id: str
    base_success: float
    max_success: float
    learning_rate: float
    gmv: float


@dataclass
class CohortConfig:
    name: str
    value_scale: float
    tasks: List[TaskConfig]


@dataclass
class SimulationConfig:
    seed: int
    episodes: int
    omni_config: OmniConfig
    thermostat_config: ThermostatConfig
    sentinel_config: SentinelConfig
    cohorts: List[CohortConfig]


@dataclass
class EpisodeResult:
    task_id: str
    success: bool
    revenue: float
    cost: float
    cohort: str


def _load_cohorts(raw: Mapping[str, object]) -> List[CohortConfig]:
    cohorts: List[CohortConfig] = []
    for name, payload in raw.items():
        tasks_data = payload.get("tasks", [])
        tasks = [
            TaskConfig(
                task_id=str(task["id"]),
                base_success=float(task["base_success"]),
                max_success=float(task["max_success"]),
                learning_rate=float(task["learning_rate"]),
                gmv=float(task["gmv"]),
            )
            for task in tasks_data
        ]
        cohorts.append(CohortConfig(name=str(name), value_scale=float(payload.get("value_scale", 1.0)), tasks=tasks))
    return cohorts


def load_simulation_config(config_dict: Mapping[str, object]) -> SimulationConfig:
    omni = config_dict["omni"]
    thermostat = config_dict["thermostat"]
    sentinels = config_dict["sentinels"]
    simulation = config_dict["simulation"]
    return SimulationConfig(
        seed=int(config_dict.get("seed", 0)),
        episodes=int(config_dict.get("episodes", 1)),
        omni_config=OmniConfig(
            fast_ema_beta=float(omni["fast_ema_beta"]),
            slow_ema_beta=float(omni["slow_ema_beta"]),
            lp_floor=float(omni["lp_floor"]),
            moi_weight_interesting=float(omni["moi_weight_interesting"]),
            moi_weight_boring=float(omni["moi_weight_boring"]),
            min_probability=float(omni["min_probability"]),
            fallback_strategy=str(omni["fallback_strategy"]),
            partition_update_interval=int(omni["partition_update_interval"]),
            exploration_epsilon=float(omni["exploration_epsilon"]),
            exploration_decay=float(omni["exploration_decay"]),
        ),
        thermostat_config=ThermostatConfig(
            roi_target=float(thermostat["roi_target"]),
            roi_floor=float(thermostat["roi_floor"]),
            fm_cost_per_call=float(thermostat["fm_cost_per_call"]),
            max_daily_fm_cost=float(thermostat["max_daily_fm_cost"]),
            epsilon_range=dict(thermostat["epsilon_range"]),
            moi_interval_bounds=dict(thermostat["moi_interval_bounds"]),
            adjust_every=int(thermostat["adjust_every"]),
            gmvs_smoothing_beta=float(thermostat["gmvs_smoothing_beta"]),
            cost_smoothing_beta=float(thermostat["cost_smoothing_beta"]),
        ),
        sentinel_config=SentinelConfig(
            roi_task_floor=float(sentinels["roi_task_floor"]),
            roi_overall_floor=float(sentinels["roi_overall_floor"]),
            moi_qps_max=float(sentinels["moi_qps_max"]),
            moi_daily_max=int(sentinels["moi_daily_max"]),
            min_task_entropy=float(sentinels["min_task_entropy"]),
            budget_limit=float(sentinels["budget_limit"]),
            diversity_injection_window=int(sentinels["diversity_injection_window"]),
            diversity_min_unique=int(sentinels["diversity_min_unique"]),
        ),
        cohorts=_load_cohorts(simulation["cohorts"]),
    )


def _initialise_engine(sim_config: SimulationConfig, interestingness_config: Mapping[str, object]) -> OmniCurriculumEngine:
    rng = random.Random(sim_config.seed)
    tasks = {task.task_id for cohort in sim_config.cohorts for task in cohort.tasks}
    oracle = OracleFactory().build(interestingness_config)
    engine = OmniCurriculumEngine(tasks=tasks, config=sim_config.omni_config, oracle=oracle, rng=rng)
    return engine


def _initialise_thermostat(sim_config: SimulationConfig) -> ThermostatController:
    return ThermostatController(
        config=sim_config.thermostat_config,
        initial_epsilon=sim_config.omni_config.exploration_epsilon,
        initial_interval=sim_config.omni_config.partition_update_interval,
    )


def _initialise_sentinels(sim_config: SimulationConfig) -> SentinelController:
    return SentinelController(sim_config.sentinel_config)


class FunnelSimulator:
    def __init__(
        self,
        sim_config: SimulationConfig,
        interestingness_config: Mapping[str, object],
        strategy: str = "omni",
    ) -> None:
        self._config = sim_config
        self._rng = random.Random(sim_config.seed)
        self._engine = _initialise_engine(sim_config, interestingness_config)
        self._thermostat = _initialise_thermostat(sim_config)
        self._sentinels = _initialise_sentinels(sim_config)
        self._strategy = strategy
        self._cohort_map: Dict[str, CohortConfig] = {cohort.name: cohort for cohort in sim_config.cohorts}
        self._task_to_cohorts: Dict[str, List[CohortConfig]] = defaultdict(list)
        self._baselines: Dict[str, float] = {
            task.task_id: task.base_success for cohort in sim_config.cohorts for task in cohort.tasks
        }
        self._success_buffer: Dict[str, float] = {
            task_id: self._baselines[task_id] for task_id in self._baselines
        }
        self._gmv = 0.0
        self._cost = 0.0
        self._fm_calls = 0
        self._episode_results: List[EpisodeResult] = []
        self._task_last_cohort: Dict[str, str] = {}
        for cohort in sim_config.cohorts:
            for task in cohort.tasks:
                self._task_to_cohorts[task.task_id].append(cohort)

    @property
    def engine(self) -> OmniCurriculumEngine:
        return self._engine

    @property
    def thermostat(self) -> ThermostatController:
        return self._thermostat

    @property
    def sentinels(self) -> SentinelController:
        return self._sentinels

    @property
    def episode_results(self) -> Sequence[EpisodeResult]:
        return tuple(self._episode_results)

    @property
    def gmv(self) -> float:
        return self._gmv

    @property
    def cost(self) -> float:
        return self._cost

    def run(self) -> None:
        for episode in range(self._config.episodes):
            if episode % self._config.thermostat_config.adjust_every == 0 and episode > 0:
                self._thermostat.ingest_metrics(
                    roi=self._gmv / max(self._cost, 1e-9),
                    fm_calls_today=self._fm_calls,
                    cumulative_gmv=self._gmv,
                    cumulative_cost=self._cost,
                )
                adjustments = self._thermostat.adjust()
                self._engine._config.exploration_epsilon = adjustments["epsilon"]
                self._engine._config.partition_update_interval = adjustments["moi_interval"]
            snapshot = self._engine.snapshot()
            diversity_alerts = self._sentinels.enforce_diversity(
                [s.probabilities for s in self._engine.history]
            )
            if self._strategy == "uniform":
                task = self._rng.choice(list(self._engine.metrics.keys()))
            else:
                if episode % max(self._engine._config.partition_update_interval, 1) == 0:
                    self._fm_calls += 1
                task = self._engine.sample_task()
            if not self._sentinels.is_task_allowed(task):
                continue
            candidate_cohorts = self._task_to_cohorts.get(task, [])
            if not candidate_cohorts:
                continue
            cohort = self._rng.choice(candidate_cohorts)
            task_config = next(t for t in cohort.tasks if t.task_id == task)
            success_prob = self._success_buffer[task]
            success = self._rng.random() < success_prob
            revenue = (task_config.gmv * cohort.value_scale) if success else 0.0
            cost = 1.0  # placeholder for intervention cost
            self._gmv += revenue
            self._cost += cost
            self._engine.update_outcome(task, success, revenue, cost)
            self._episode_results.append(
                EpisodeResult(task_id=task, success=success, revenue=revenue, cost=cost, cohort=cohort.name)
            )
            self._task_last_cohort[task] = cohort.name
            if success:
                delta = (task_config.max_success - success_prob) * task_config.learning_rate
                self._success_buffer[task] = min(success_prob + delta, task_config.max_success)
            else:
                self._success_buffer[task] = max(success_prob * (1 - 0.05), task_config.base_success)
            if self._strategy != "uniform":
                self._sentinels.enforce_roi(self._engine)

    def to_csv(self, output: pathlib.Path) -> None:
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", newline="") as fp:
            writer = csv.writer(fp)
            writer.writerow(["episode", "task", "success", "revenue", "cost", "cohort"])
            for idx, result in enumerate(self._episode_results):
                writer.writerow([idx, result.task_id, int(result.success), result.revenue, result.cost, result.cohort])

    def distribution_timeseries(self) -> List[Dict[str, float]]:
        return [snapshot.probabilities for snapshot in self._engine.history]

    def telemetry_bundle(self) -> Dict[str, object]:
        return {
            "gmv": self._gmv,
            "cost": self._cost,
            "roi": self._gmv / max(self._cost, 1e-9),
            "disabled_tasks": list(self._sentinels.disable_tasks()),
            "metrics": {
                task: {
                    "success_rate": metrics.success_rate,
                    "lp": metrics.lp,
                    "roi": metrics.roi,
                }
                for task, metrics in self._engine.metrics.items()
            },
        }


def save_json(data: Mapping[str, object], path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def save_distribution_csv(history: Sequence[Mapping[str, float]], path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tasks = sorted(history[0].keys()) if history else []
    with path.open("w", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(["episode", *tasks])
        for idx, snapshot in enumerate(history):
            writer.writerow([idx, *[snapshot[task] for task in tasks]])


def gmv_series(results: Sequence[EpisodeResult]) -> List[float]:
    series: List[float] = [0.0] * len(results)
    total = 0.0
    for idx, result in enumerate(results):
        total += result.revenue
        series[idx] = total
    return series
