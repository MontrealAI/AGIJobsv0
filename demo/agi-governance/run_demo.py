"""Governance-grade simulation harness for the AGI governance demo.

This runner ingests the mission manifest (thermodynamics,
Hamiltonian coefficients, and game-theoretic allocations) and emits a
succinct, reproducible report. The calculations stay lightweight so the
script can execute inside CI sandboxes while still surfacing the physics
and governance signals operators care about.
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Mapping, Sequence


@dataclass(frozen=True)
class EnergyLevel:
    energy: float
    degeneracy: int


@dataclass(frozen=True)
class Mission:
    title: str
    enthalpy_kj: float
    entropy_kj_per_k: float
    temperature_k: float
    beta: float
    energy_scaling: float
    levels: Sequence[EnergyLevel]
    payoff_matrix: Sequence[Sequence[float]]
    strategy_shares: Sequence[float]
    required_owner_categories: Sequence[str]
    owner_control_categories: Sequence[str]

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> "Mission":
        thermo = payload.get("thermodynamics", {})
        stats = payload.get("statisticalPhysics", {})
        game = payload.get("gameTheory", {})
        owner_controls = payload.get("ownerControls", {})

        def _owner_categories(block: Iterable[Mapping[str, object]]) -> list[str]:
            return [str(item.get("category", "")) for item in block if "category" in item]

        return cls(
            title=str(payload.get("meta", {}).get("title", "")),
            enthalpy_kj=float(thermo.get("enthalpyKJ", 0.0)),
            entropy_kj_per_k=float(thermo.get("entropyKJPerK", 0.0)),
            temperature_k=float(thermo.get("operatingTemperatureK", 298.15)),
            beta=float(stats.get("beta", 0.0)),
            energy_scaling=float(stats.get("energyScaling", 1.0)),
            levels=[
                EnergyLevel(float(item.get("energy", 0.0)), int(item.get("degeneracy", 1)))
                for item in stats.get("energyLevels", [])
            ],
            payoff_matrix=[
                [float(value) for value in row] for row in game.get("payoffMatrix", [])
            ],
            strategy_shares=[
                float(strat.get("initialShare", 0.0)) for strat in game.get("strategies", [])
            ],
            required_owner_categories=[
                str(cat) for cat in owner_controls.get("requiredCategories", [])
            ],
            owner_control_categories=_owner_categories(owner_controls.get("criticalCapabilities", []))
            + _owner_categories(owner_controls.get("upgradeActions", [])),
        )


def _stable_partition(levels: Iterable[EnergyLevel], beta: float, scale: float) -> tuple[float, float]:
    """Compute a partition function and expected energy with log-sum-exp stability."""

    energies: List[float] = [level.energy * scale for level in levels]
    if not energies:
        return 0.0, 0.0

    min_energy = min(energies)
    weights = [
        level.degeneracy * math.exp(-beta * (energy - min_energy))
        for level, energy in zip(levels, energies)
    ]

    partition = sum(weights)
    if partition == 0:
        return 0.0, 0.0

    expected_energy = sum(weight * energy for weight, energy in zip(weights, energies)) / partition
    return partition, expected_energy


def compute_governance_metrics(mission: Mission) -> dict[str, float | list[str]]:
    gibbs_free_energy = mission.enthalpy_kj - mission.temperature_k * mission.entropy_kj_per_k
    partition, expected_energy = _stable_partition(mission.levels, mission.beta, mission.energy_scaling)

    owner_categories = set(mission.owner_control_categories)
    missing_categories = [
        category
        for category in mission.required_owner_categories
        if category not in owner_categories
    ]

    return {
        "title": mission.title,
        "gibbs_free_energy_kj": gibbs_free_energy,
        "partition_function": partition,
        "expected_energy_kj": expected_energy,
        "strategy_entropy": _strategy_entropy(mission.strategy_shares),
        "missing_owner_categories": missing_categories,
    }


def _strategy_entropy(shares: Sequence[float]) -> float:
    safe_shares = [share for share in shares if share > 0]
    total = sum(safe_shares)
    if total == 0:
        return 0.0
    normalized = [share / total for share in safe_shares]
    return -sum(prob * math.log(prob) for prob in normalized)


def _format_report(metrics: Mapping[str, object]) -> str:
    return "\n".join(
        [
            f"🌌 Mission: {metrics.get('title', '')}",
            f"  • Gibbs free energy (kJ): {metrics['gibbs_free_energy_kj']:.2f}",
            f"  • Partition function: {metrics['partition_function']:.4f}",
            f"  • Expected energy (kJ): {metrics['expected_energy_kj']:.2f}",
            f"  • Strategy entropy: {metrics['strategy_entropy']:.4f}",
            _owner_summary(metrics.get("missing_owner_categories", [])),
        ]
    )


def _owner_summary(missing: Iterable[str]) -> str:
    missing_list = list(missing)
    if not missing_list:
        return "  • Owner controls: all required categories present"
    return "  • Owner controls: missing " + ", ".join(sorted(missing_list))


def load_mission(path: Path) -> Mission:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return Mission.from_payload(payload)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mission",
        type=Path,
        default=Path(__file__).parent / "config" / "mission@v1.json",
        help="Path to a mission manifest (JSON).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable metrics instead of the formatted report.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    mission = load_mission(args.mission)
    metrics = compute_governance_metrics(mission)

    if args.json:
        print(json.dumps(metrics, indent=2))
    else:
        print(_format_report(metrics))


if __name__ == "__main__":
    main()
