"""Policy engine for the Omega-grade K2 upgrade demo."""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Dict, Iterable, List


Action = Dict[str, float]


@dataclass(frozen=True, slots=True)
class PolicyDecision:
    action: Action
    rationale: Dict[str, float]
    steps: List[str]


def build_policy_decision(state: Dict[str, float]) -> PolicyDecision:
    signals = _compute_policy_signals(state)
    action = _build_action(signals)
    steps = _format_steps(action)
    rationale = {**signals, "action_intensity": _action_intensity(action)}
    return PolicyDecision(action=action, rationale=rationale, steps=steps)


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _action_intensity(action: Action) -> float:
    if not action:
        return 0.0
    return sum(action.values()) / max(len(action), 1)


def _compute_policy_signals(state: Dict[str, float]) -> Dict[str, float]:
    prosperity_index = _clamp(float(state.get("prosperity_index", 0.0)), 0.0, 1.0)
    sustainability_index = _clamp(float(state.get("sustainability_index", 0.0)), 0.0, 1.0)
    coordination_index = _clamp(float(state.get("coordination_index", 0.0)), 0.0, 1.0)
    nash_welfare = _clamp(float(state.get("nash_welfare", 0.0)), 0.0, 1.0)
    sentient_welfare_index = _clamp(float(state.get("sentient_welfare_index", 0.0)), 0.0, 1.0)
    stability_index = _clamp(float(state.get("stability_index", 0.0)), 0.0, 1.0)
    game_theory_slack = _clamp(float(state.get("game_theory_slack", 0.0)), 0.0, 1.0)
    entropy = max(0.0, float(state.get("entropy", 0.0)))
    entropy_pressure = _clamp(entropy / math.log(2.0), 0.0, 1.0)
    gibbs_reference = float(state.get("gibbs_free_energy", state.get("free_energy", 0.0)))
    gibbs_drive = max(0.0, -gibbs_reference)
    hamiltonian_pressure = _clamp(abs(float(state.get("hamiltonian", 0.0))), 0.0, 1.0)
    temperature = max(0.4, float(state.get("temperature", 1.0)))

    prosperity_gap = _clamp(1.0 - prosperity_index, 0.0, 1.0)
    sustainability_gap = _clamp(1.0 - sustainability_index, 0.0, 1.0)
    coordination_gap = _clamp(1.0 - coordination_index, 0.0, 1.0)
    welfare_urgency = _clamp(1.0 - sentient_welfare_index, 0.0, 1.0)

    prosperity_weight = math.exp(prosperity_gap / temperature)
    sustainability_weight = math.exp(sustainability_gap / temperature)
    total_weight = prosperity_weight + sustainability_weight
    if total_weight == 0.0:
        prosperity_share = 0.5
        sustainability_share = 0.5
    else:
        prosperity_share = prosperity_weight / total_weight
        sustainability_share = sustainability_weight / total_weight

    return {
        "prosperity_index": prosperity_index,
        "sustainability_index": sustainability_index,
        "coordination_index": coordination_index,
        "prosperity_gap": prosperity_gap,
        "sustainability_gap": sustainability_gap,
        "coordination_gap": coordination_gap,
        "nash_welfare": nash_welfare,
        "sentient_welfare_index": sentient_welfare_index,
        "stability_index": stability_index,
        "game_theory_slack": game_theory_slack,
        "entropy_pressure": entropy_pressure,
        "gibbs_drive": gibbs_drive,
        "hamiltonian_pressure": hamiltonian_pressure,
        "welfare_urgency": welfare_urgency,
        "temperature": temperature,
        "prosperity_share": prosperity_share,
        "sustainability_share": sustainability_share,
    }


def _build_action(signals: Dict[str, float]) -> Action:
    coordination_damping = 0.65 + 0.35 * signals["game_theory_slack"]
    stability_guard = 0.7 + 0.3 * signals["stability_index"]
    entropy_damping = 0.6 + 0.4 * (1.0 - signals["entropy_pressure"])

    action_budget = (
        1.4
        + 3.2 * signals["gibbs_drive"]
        + 2.2 * signals["welfare_urgency"]
        + 1.4 * signals["coordination_gap"]
    )
    action_budget *= coordination_damping * stability_guard * entropy_damping
    action_budget *= 0.8 + 0.2 * signals["nash_welfare"]

    build_solar = (
        action_budget
        * signals["prosperity_share"]
        * (0.9 + 0.2 * signals["hamiltonian_pressure"])
        * (0.7 + 0.3 * stability_guard)
    )
    deploy_data_centers = (
        action_budget
        * signals["sustainability_share"]
        * (0.9 + 0.2 * signals["coordination_gap"])
        * (0.7 + 0.3 * stability_guard)
    )
    invest_in_research = (
        action_budget
        * (0.5 * signals["coordination_gap"] + 0.5 * signals["welfare_urgency"])
        * (0.8 + 0.2 * (1.0 - signals["entropy_pressure"]))
    )
    population_growth = (
        action_budget
        * 0.12
        * (0.4 + 0.6 * signals["stability_index"])
        * (1.0 - 0.6 * signals["entropy_pressure"])
    )

    raw = {
        "build_solar": build_solar,
        "deploy_data_centers": deploy_data_centers,
        "invest_in_research": invest_in_research,
        "population_growth": population_growth,
    }
    return {key: _clamp(value, 0.0, 10.0) for key, value in raw.items()}


def _format_steps(action: Action) -> List[str]:
    steps: List[str] = []
    ordered_steps: Iterable[tuple[str, str]] = (
        ("build_solar", "Expand orbital solar capture"),
        ("deploy_data_centers", "Deploy quantum data centers"),
        ("invest_in_research", "Invest in coordination research"),
        ("population_growth", "Stabilize population trajectory"),
    )
    for key, label in ordered_steps:
        value = float(action.get(key, 0.0))
        if value <= 0.0:
            continue
        steps.append(f"{label}: {value:.2f}")
    if not steps:
        steps.append("Hold steady; no material policy action recommended this cycle.")
    return steps


__all__ = ["PolicyDecision", "build_policy_decision"]
