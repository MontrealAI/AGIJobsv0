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


def _stable_partition(levels: Iterable[EnergyLevel], beta: float, scale: float) -> dict[str, float | str | None]:
    """Log-sum-exp without mislabeling shifted normalization as physical Z."""
    rows = list(levels)
    if not rows:
        return {"partition_function": None, "partition_status": "not-supplied",
                "log_partition_function": None, "shifted_normalization": None,
                "log_weight_offset": None, "expected_energy_kj": None}
    if not math.isfinite(beta) or not math.isfinite(scale):
        raise ValueError("Supply finite beta/energy scaling")
    energies, logits = [], []
    for level in rows:
        if type(level.degeneracy) is not int or level.degeneracy < 1:
            raise ValueError("Energy degeneracy must be a positive integer")
        energy = level.energy * scale
        logit = math.log(level.degeneracy) - beta * energy
        if not math.isfinite(energy) or not math.isfinite(logit):
            raise ValueError("Energy and log weights must remain finite")
        energies.append(energy)
        logits.append(logit)
    offset = max(logits)
    weights = [math.exp(value - offset) for value in logits]
    normalization = math.fsum(weights)
    log_partition = offset + math.log(normalization)
    if not math.isfinite(log_partition):
        raise ValueError("Log partition exceeds finite numeric range")
    try:
        partition = math.exp(log_partition)
    except OverflowError:
        partition = None
    status = "representable" if partition is not None and partition > 0 else (
        "overflow" if partition is None else "underflow")
    if status != "representable":
        partition = None
    # Normalize before multiplying to avoid an overflowing numerator.
    expected = math.fsum((weight / normalization) * energy for weight, energy in zip(weights, energies))
    if not math.isfinite(expected):
        raise ValueError("Expected energy exceeds finite numeric range")
    return {"partition_function": partition, "partition_status": status,
            "log_partition_function": log_partition,
            "shifted_normalization": normalization, "log_weight_offset": offset,
            "expected_energy_kj": expected}


def compute_governance_metrics(mission: Mission) -> dict[str, float | list[str]]:
    gibbs_free_energy = mission.enthalpy_kj - mission.temperature_k * mission.entropy_kj_per_k
    partition = _stable_partition(mission.levels, mission.beta, mission.energy_scaling)

    owner_categories = set(mission.owner_control_categories)
    missing_categories = [
        category
        for category in mission.required_owner_categories
        if category not in owner_categories
    ]

    return {
        "title": mission.title,
        "evidence_mode": "supplied-input mathematical model",
        "owner_controls_enforced": False,
        "production_approved": False,
        "settlement_approved": False,
        "gibbs_free_energy_kj": gibbs_free_energy,
        **partition,
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
            f"  • Log partition function: {metrics['log_partition_function']}",
            f"  • Partition representability: {metrics['partition_status']}",
            f"  • Shifted normalization: {metrics['shifted_normalization']}",
            f"  • Expected energy (kJ): {metrics['expected_energy_kj']}",
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
