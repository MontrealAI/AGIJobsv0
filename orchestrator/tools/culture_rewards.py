"""Derive weekly culture rewards from the orchestrator scoreboard."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from ..scoreboard import get_scoreboard

DEFAULT_OUTPUT = Path("storage/orchestrator/culture_rewards.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate weekly culture reward allocations.")
    parser.add_argument(
        "--total",
        type=float,
        default=float(1000),
        help="Total reward budget in AGIALPHA tokens (default: 1000).",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=5,
        help="Number of top agents to include (default: 5).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="File to write the allocation summary (default: storage/orchestrator/culture_rewards.json).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    scoreboard = get_scoreboard().snapshot()
    agents = [
        {
            "address": agent,
            "wins": entry.get("wins", 0),
            "losses": entry.get("losses", 0),
            "slashes": entry.get("slashes", 0),
        }
        for agent, entry in scoreboard.items()
    ]
    agents.sort(key=lambda item: item["wins"], reverse=True)
    top_agents = [agent for agent in agents if agent["wins"] > 0][: args.top]
    total_wins = sum(agent["wins"] for agent in top_agents)
    if total_wins == 0:
        print("No eligible agents with recorded wins; skipping allocation.")
        return

    allocations = []
    for agent in top_agents:
        share = agent["wins"] / total_wins
        amount = round(args.total * share, 4)
        allocations.append({"address": agent["address"], "wins": agent["wins"], "amount": amount})

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "totalReward": args.total,
                "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "allocations": allocations,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"✅ Wrote culture reward allocations for {len(allocations)} agents to {args.output}.")


if __name__ == "__main__":
    main()

