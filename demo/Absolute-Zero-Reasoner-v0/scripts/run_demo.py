"""CLI entrypoint for the Absolute Zero Reasoner demo."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGE_ROOT = SCRIPT_DIR.parent
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from absolute_zero_demo import AbsoluteZeroDemo, DemoConfig


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Absolute Zero Reasoner demo")
    parser.add_argument("--iterations", type=int, default=8, help="Number of propose/solve loops")
    parser.add_argument("--batch-size", type=int, help="Tasks per iteration")
    parser.add_argument("--max-budget", type=float, help="Maximum simulated USD spend")
    parser.add_argument("--seed", type=int, default=1234, help="Random seed for reproducibility")
    return parser.parse_args()


def build_config(args: argparse.Namespace) -> DemoConfig:
    config = DemoConfig()
    if args.batch_size:
        config.batch_size = args.batch_size
    if args.max_budget:
        config.guardrails.max_budget_usd = args.max_budget
    return config


def render_dashboard(iteration: int, outcome, cumulative_value: float, cumulative_cost: float) -> str:
    roi = 0.0 if cumulative_cost == 0 else (cumulative_value - cumulative_cost) / max(1e-6, cumulative_cost) * 100
    guardrail = ", ".join(outcome.guardrail_events) if outcome.guardrail_events else "none"
    return (
        "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n"
        f"┃ Absolute Zero Reasoner – iteration {iteration:<3} ┃\n"
        "┣━━━━━━━━━━━━━━━━━━━━━━━━━┯━━━━━━━━━━━┫\n"
        f"┃ Tasks proposed           │ {len(outcome.tasks):<9}┃\n"
        f"┃ Tasks solved             │ {outcome.solved:<9}┃\n"
        f"┃ Simulated GMV            │ ${cumulative_value:>7.2f} ┃\n"
        f"┃ Simulated cost           │ ${cumulative_cost:>7.2f} ┃\n"
        f"┃ ROI                      │ {roi:>7.2f}%┃\n"
        f"┃ Guardrail events         │ {guardrail:<9}┃\n"
        "┗━━━━━━━━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━┛"
    )


def main() -> None:
    args = parse_args()
    config = build_config(args)
    demo = AbsoluteZeroDemo(config)
    cumulative_value = 0.0
    cumulative_cost = 0.0
    for iteration in range(1, args.iterations + 1):
        outcome = demo.run_iteration()
        cumulative_value += outcome.gross_value
        cumulative_cost += outcome.total_cost
        print(render_dashboard(iteration, outcome, cumulative_value, cumulative_cost))
        if cumulative_cost > config.guardrails.max_budget_usd:
            print("Budget threshold reached; halting demo.")
            break


if __name__ == "__main__":
    main()
