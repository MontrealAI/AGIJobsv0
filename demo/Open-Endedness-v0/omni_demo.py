"""Executable demo comparing OMNI vs LP-only vs Uniform curricula."""
from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Mapping, Tuple

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from config_utils import (
    DEFAULT_CONFIG_PATH,
    load_config,
    owner_disabled_tasks,
)
from omni_engine import ModelOfInterestingness, OmniCurriculumEngine
from thermostat import EconomicSnapshot, ThermostatController
from sentinel import Sentinel, SentinelConfig
from ledger import EconomicLedger


@dataclass
class Task:
    task_id: str
    description: str
    base_success: float
    learning_rate: float
    value: float


@dataclass
class StrategyResult:
    name: str
    cumulative_revenue: List[float]
    cumulative_cost: List[float]
    cumulative_profit: List[float]
    tasks_mastered: Dict[str, float]
    fm_queries: int = 0
    practice_gain: Dict[str, float] | None = None
    ledger_totals: Dict[str, float] | None = None
    sentinel_events: List[Dict[str, object]] | None = None
    thermostat_events: List[Dict[str, object]] | None = None
    owner_disabled: List[str] | None = None
    owner_paused: bool | None = None
    task_frequency: Dict[str, int] | None = None
    owner_events: List[Dict[str, object]] | None = None


TASKS = [
    Task("cta_refinement", "Refine call-to-action wording for premium plan", 0.25, 0.01, 280.0),
    Task("discount_optimizer", "Auto-tune personalised hiring discount", 0.08, 0.08, 1040.0),
    Task("matchmaking_ai", "Autonomous talent-job matchmaking", 0.06, 0.1, 1850.0),
    Task("talent_nurture", "Launch multi-touch nurture campaigns", 0.12, 0.055, 720.0),
    Task("salary_benchmark", "Dynamic salary benchmarking insights", 0.14, 0.05, 600.0),
]

ITERATIONS = 1000
SEED = 777
class Simulator:
    def __init__(
        self,
        strategy: str,
        rng: random.Random,
        config: Mapping[str, object],
    ) -> None:
        self.strategy = strategy
        self.rng = rng
        self.tasks = {task.task_id: task for task in TASKS}
        self.success_rates = {task.task_id: task.base_success for task in TASKS}
        self.practice_gain = {task.task_id: 0.0 for task in TASKS}
        self.task_counts = {task.task_id: 0 for task in TASKS}
        curriculum_cfg = config.get("curriculum", {}) if isinstance(config, Mapping) else {}
        moi_cfg = curriculum_cfg.get("moi", {}) if isinstance(curriculum_cfg, Mapping) else {}
        moi_client = ModelOfInterestingness(
            boring_weight=float(moi_cfg.get("boring_weight", 1e-3)),
            interesting_weight=float(moi_cfg.get("interesting_weight", 1.0)),
            overlap_threshold=float(moi_cfg.get("overlap_threshold", 0.6)),
        )
        self.engine = OmniCurriculumEngine(
            task_descriptions={task.task_id: task.description for task in TASKS},
            fast_beta=float(curriculum_cfg.get("fast_beta", 0.1)),
            slow_beta=float(curriculum_cfg.get("slow_beta", 0.01)),
            min_probability=float(curriculum_cfg.get("min_probability", 1e-3)),
            moi_client=moi_client,
            rng=self.rng,
        )
        thermostat_cfg = config.get("thermostat", {}) if isinstance(config, Mapping) else {}
        self.thermostat = ThermostatController(
            engine=self.engine,
            roi_target=float(thermostat_cfg.get("roi_target", 5.0)),
            roi_floor=float(thermostat_cfg.get("roi_floor", 2.0)),
            min_moi_interval=int(thermostat_cfg.get("min_moi_interval", 25)),
            max_moi_interval=int(thermostat_cfg.get("max_moi_interval", 200)),
        )
        self.exploration_epsilon = float(thermostat_cfg.get("exploration_epsilon", 0.0))
        sentinel_cfg = config.get("sentinel", {}) if isinstance(config, Mapping) else {}
        fm_cost = float(
            (config.get("cost_model", {}) if isinstance(config, Mapping) else {}).get(
                "fm_call_cost", sentinel_cfg.get("fm_cost_per_query", 0.03)
            )
        )
        self.sentinel = Sentinel(
            engine=self.engine,
            config=SentinelConfig(
                task_roi_floor=float(sentinel_cfg.get("task_roi_floor", 1.0)),
                overall_roi_floor=float(sentinel_cfg.get("overall_roi_floor", 1.8)),
                budget_limit=float(sentinel_cfg.get("budget_limit", 500.0)),
                moi_daily_max=int(sentinel_cfg.get("moi_daily_max", 500)),
                min_entropy=float(sentinel_cfg.get("min_entropy", 0.6)),
                qps_limit=float(sentinel_cfg.get("qps_limit", 0.05)),
                fm_cost_per_query=float(sentinel_cfg.get("fm_cost_per_query", fm_cost)),
            ),
        )
        self.fm_queries = 0
        self.ledger = EconomicLedger()
        self.fm_call_cost = fm_cost
        owner_cfg = config.get("owner", {}) if isinstance(config, Mapping) else {}
        self.owner_paused = bool(owner_cfg.get("paused", False))
        self.owner_disabled = set(owner_disabled_tasks(config))
        self.owner_events: List[Dict[str, object]] = []
        if self.owner_paused:
            self.owner_events.append({"step": 0, "action": "owner_pause_active"})
        if self.owner_disabled:
            self.owner_events.append(
                {"step": 0, "action": "owner_disabled_tasks", "tasks": sorted(self.owner_disabled)}
            )
        for task_id in self.owner_disabled:
            if task_id in self.tasks:
                self.engine.set_task_disabled(task_id, True)

    def pick_task(self, step: int) -> Tuple[str, bool]:
        available_tasks = [task_id for task_id in self.tasks if task_id not in self.engine.disabled_tasks]
        if not available_tasks:
            available_tasks = list(self.tasks)
        if self.strategy == "uniform":
            return self.rng.choice(available_tasks), False
        if self.strategy == "lp":
            for task_id, state in sorted(
                self.engine.tasks.items(), key=lambda kv: kv[1].learning_progress, reverse=True
            ):
                return task_id, False
            return self.rng.choice(available_tasks), False
        if self.strategy == "omni":
            if self.owner_paused:
                return self.rng.choice(available_tasks), False
            if self.exploration_epsilon and self.rng.random() < self.exploration_epsilon:
                return self.rng.choice(available_tasks), False
            fm_queried = False
            self.thermostat.tick()
            if self.thermostat.should_refresh_partition() and self.sentinel.can_issue_fm_query(step):
                self.engine.refresh_partition()
                self.thermostat.mark_refreshed()
                self.fm_queries += 1
                self.sentinel.register_moi_query(step=step, fm_cost=self.fm_call_cost)
                fm_queried = True
            return self.engine.sample_task(), fm_queried
        raise ValueError(f"Unknown strategy {self.strategy}")

    def run(self) -> StrategyResult:
        revenue: List[float] = []
        cost: List[float] = []
        profit: List[float] = []
        total_revenue = 0.0
        total_cost = 0.0
        total_profit = 0.0

        for index in range(ITERATIONS):
            step = index + 1
            task_id, fm_queried = self.pick_task(step)
            task = self.tasks[task_id]
            self.task_counts[task_id] += 1
            success_prob = self.success_rates[task_id]
            success = 1 if self.rng.random() < success_prob else 0
            reward = success * task.value
            call_cost = self.fm_call_cost if fm_queried else 0.0
            total_revenue += reward
            total_cost += call_cost
            total_profit += reward - call_cost
            revenue.append(total_revenue)
            cost.append(total_cost)
            profit.append(total_profit)

            self.ledger.record(
                step=step,
                strategy=self.strategy.upper(),
                task_id=task_id,
                success=bool(success),
                revenue=reward,
                fm_cost=call_cost,
                intervention_cost=0.0,
            )

            if self.strategy == "omni":
                self.engine.update_task_outcome(task_id, float(success))
                self.sentinel.register_outcome(task_id, reward, call_cost)
                snapshot = EconomicSnapshot(
                    conversions=float(success),
                    revenue=reward,
                    fm_cost=call_cost,
                    intervention_cost=0.0,
                )
                self.thermostat.update(snapshot, ledger=self.ledger, step=step)
                self.sentinel.evaluate(self.ledger, step)

            increment = task.learning_rate * (0.5 + 0.5 * success)
            self.practice_gain[task_id] = min(
                self.practice_gain[task_id] + increment,
                0.95 - task.base_success,
            )
            if not success:
                self.practice_gain[task_id] = max(
                    self.practice_gain[task_id] - task.learning_rate * 0.02,
                    0.0,
                )
            self.success_rates[task_id] = min(
                task.base_success + self.practice_gain[task_id],
                0.95,
            )

            for other_task_id in list(self.success_rates.keys()):
                if other_task_id == task_id:
                    continue
                decay_target = self.practice_gain[other_task_id] * 0.9
                self.practice_gain[other_task_id] = max(decay_target, 0.0)
                other_task = self.tasks[other_task_id]
                self.success_rates[other_task_id] = min(
                    other_task.base_success + self.practice_gain[other_task_id],
                    0.95,
                )

        mastered = {
            task_id: rate
            for task_id, rate in self.success_rates.items()
            if rate >= 0.4
        }

        return StrategyResult(
            name=self.strategy,
            cumulative_revenue=revenue,
            cumulative_cost=cost,
            cumulative_profit=profit,
            tasks_mastered=mastered,
            fm_queries=self.fm_queries,
            practice_gain=dict(self.practice_gain),
            ledger_totals=dict(self.ledger.totals()),
            sentinel_events=list(self.sentinel.events) if self.strategy == "omni" else None,
            thermostat_events=list(self.thermostat.events) if self.strategy == "omni" else None,
            owner_disabled=sorted(self.owner_disabled) if self.owner_disabled else None,
            owner_paused=self.owner_paused,
            task_frequency=dict(self.task_counts),
            owner_events=list(self.owner_events),
        )


def compare_strategies(
    render: bool,
    output_dir: Path,
    config_path: Path,
    cohort: str | None,
) -> Dict[str, StrategyResult]:
    output_dir.mkdir(parents=True, exist_ok=True)
    strategy_seeds = {"uniform": SEED + 1, "lp": SEED + 2, "omni": SEED + 3}
    results = {}
    config = load_config(config_path, cohort=cohort)
    resolved_config = config.resolved
    for strategy in ("uniform", "lp", "omni"):
        sim = Simulator(
            strategy=strategy,
            rng=random.Random(strategy_seeds[strategy]),
            config=resolved_config,
        )
        results[strategy] = sim.run()

    max_events = 50
    summary = {
        name: {
            "final_revenue": res.cumulative_revenue[-1],
            "final_profit": res.cumulative_profit[-1],
            "fm_queries": res.fm_queries,
            "tasks_mastered": res.tasks_mastered,
            "frontier_count": sum(
                1
                for task_id, gain in (res.practice_gain or {}).items()
                if task_id != "cta_refinement" and gain >= 0.4
            ),
            "roi_overall": (res.ledger_totals or {}).get("roi_overall"),
            "owner_paused": res.owner_paused,
            "owner_disabled": res.owner_disabled,
            "task_frequency": res.task_frequency or {},
            "thermostat_events": (res.thermostat_events or [])[:max_events],
            "sentinel_events": (res.sentinel_events or [])[:max_events],
            "owner_events": (res.owner_events or [])[:max_events],
            "total_revenue": res.cumulative_revenue[-1],
            "operational_cost": (res.ledger_totals or {}).get("intervention_cost", 0.0),
            "fm_cost": (res.ledger_totals or {}).get("fm_cost", 0.0),
            "roi_total": (res.ledger_totals or {}).get("roi_overall"),
            "roi_fm": (
                (res.ledger_totals or {}).get("revenue", 0.0)
                / max((res.ledger_totals or {}).get("fm_cost", 0.0), 1e-9)
                if (res.ledger_totals or {}).get("fm_cost", 0.0) > 0
                else float("inf")
            ),
            "paused_steps": ITERATIONS if res.owner_paused else 0,
        }
        for name, res in results.items()
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    if render:
        try:
            import matplotlib.pyplot as plt
        except ImportError:  # pragma: no cover - optional dependency
            print("matplotlib not installed; skipping plot generation.")
        else:
            fig, ax = plt.subplots(figsize=(10, 6))
            for name, res in results.items():
                ax.plot(res.cumulative_revenue, label=f"{name.title()} Revenue")
            ax.set_title("GMV Trajectory per Strategy")
            ax.set_xlabel("Iterations")
            ax.set_ylabel("Cumulative GMV (USD)")
            ax.legend()
            fig.tight_layout()
            fig.savefig(output_dir / "gmv.png", dpi=200)
            plt.close(fig)

            fig, ax = plt.subplots(figsize=(10, 6))
            for name, res in results.items():
                ax.plot(res.cumulative_profit, label=f"{name.title()} Profit")
            ax.set_title("Profit after FM Costs")
            ax.set_xlabel("Iterations")
            ax.set_ylabel("USD")
            ax.legend()
            fig.tight_layout()
            fig.savefig(output_dir / "profit.png", dpi=200)
            plt.close(fig)

    return results


def build_argument(results: Dict[str, StrategyResult]) -> str:
    def growth_delta(metric: str) -> float:
        omni = getattr(results["omni"], metric)[-1]
        baseline = getattr(results["lp"], metric)[-1]
        return (omni - baseline) / max(baseline, 1e-6)

    lift = growth_delta("cumulative_revenue")
    profit_gap = growth_delta("cumulative_profit")
    frontier = sum(
        1
        for task_id, gain in (results["omni"].practice_gain or {}).items()
        if task_id != "cta_refinement" and gain >= 0.4
    )
    return (
        "OMNI unlocks {:.1%} more GMV and {:.1%} more profit than LP-only, "
        "while cultivating {} frontier capabilities."
    ).format(lift, profit_gap, frontier)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--render", action="store_true", help="generate plots")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("reports/omni_demo"),
        help="Where to store outputs",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Configuration YAML controlling the curriculum",
    )
    parser.add_argument(
        "--cohort",
        type=str,
        default=None,
        help="Optional cohort override defined in the config",
    )
    args = parser.parse_args()

    results = compare_strategies(
        render=args.render,
        output_dir=args.output_dir,
        config_path=args.config,
        cohort=args.cohort,
    )
    narrative = build_argument(results)
    print("\n=== OMNI Executive Summary ===")
    print(narrative)
    for name, res in results.items():
        frontier = sum(
            1
            for task_id, gain in (res.practice_gain or {}).items()
            if task_id != "cta_refinement" and gain >= 0.4
        )
        print(
            f"- {name.title():7s}: GMV ${res.cumulative_revenue[-1]:,.0f} | Profit ${res.cumulative_profit[-1]:,.0f} | Frontier gains {frontier}"
        )


if __name__ == "__main__":
    main()
