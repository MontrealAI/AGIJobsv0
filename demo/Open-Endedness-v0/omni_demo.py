"""Executable demo comparing OMNI vs LP-only vs Uniform curricula."""
from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from omni_engine import OmniCurriculumEngine
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


TASKS = [
    Task("cta_refinement", "Refine call-to-action wording for premium plan", 0.25, 0.01, 280.0),
    Task("discount_optimizer", "Auto-tune personalised hiring discount", 0.08, 0.08, 1040.0),
    Task("matchmaking_ai", "Autonomous talent-job matchmaking", 0.06, 0.1, 1850.0),
    Task("talent_nurture", "Launch multi-touch nurture campaigns", 0.12, 0.055, 720.0),
    Task("salary_benchmark", "Dynamic salary benchmarking insights", 0.14, 0.05, 600.0),
]

ITERATIONS = 1000
SEED = 777
FM_CALL_COST = 0.03


class Simulator:
    def __init__(self, strategy: str, rng: random.Random) -> None:
        self.strategy = strategy
        self.rng = rng
        self.tasks = {task.task_id: task for task in TASKS}
        self.success_rates = {task.task_id: task.base_success for task in TASKS}
        self.practice_gain = {task.task_id: 0.0 for task in TASKS}
        self.engine = OmniCurriculumEngine(
            task_descriptions={task.task_id: task.description for task in TASKS},
            rng=self.rng,
        )
        self.thermostat = ThermostatController(
            engine=self.engine,
            roi_target=5.0,
            roi_floor=2.0,
            min_moi_interval=25,
            max_moi_interval=200,
        )
        self.sentinel = Sentinel(
            engine=self.engine,
            config=SentinelConfig(
                task_roi_floor=1.0,
                overall_roi_floor=1.8,
                budget_limit=500.0,
                moi_daily_max=500,
                min_entropy=0.6,
                qps_limit=0.05,
                fm_cost_per_query=FM_CALL_COST,
            ),
        )
        self.fm_queries = 0
        self.ledger = EconomicLedger()

    def pick_task(self, step: int) -> Tuple[str, bool]:
        if self.strategy == "uniform":
            return self.rng.choice(list(self.tasks)), False
        if self.strategy == "lp":
            for task_id, state in sorted(
                self.engine.tasks.items(), key=lambda kv: kv[1].learning_progress, reverse=True
            ):
                return task_id, False
            return self.rng.choice(list(self.tasks)), False
        if self.strategy == "omni":
            fm_queried = False
            self.thermostat.tick()
            if self.thermostat.should_refresh_partition() and self.sentinel.can_issue_fm_query(step):
                self.engine.refresh_partition()
                self.thermostat.mark_refreshed()
                self.fm_queries += 1
                self.sentinel.register_moi_query(step=step, fm_cost=FM_CALL_COST)
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
            success_prob = self.success_rates[task_id]
            success = 1 if self.rng.random() < success_prob else 0
            reward = success * task.value
            call_cost = FM_CALL_COST if fm_queried else 0.0
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
        )


def compare_strategies(render: bool, output_dir: Path) -> Dict[str, StrategyResult]:
    output_dir.mkdir(parents=True, exist_ok=True)
    strategy_seeds = {"uniform": SEED + 1, "lp": SEED + 2, "omni": SEED + 3}
    results = {}
    for strategy in ("uniform", "lp", "omni"):
        sim = Simulator(strategy=strategy, rng=random.Random(strategy_seeds[strategy]))
        results[strategy] = sim.run()

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
    args = parser.parse_args()

    results = compare_strategies(render=args.render, output_dir=args.output_dir)
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
