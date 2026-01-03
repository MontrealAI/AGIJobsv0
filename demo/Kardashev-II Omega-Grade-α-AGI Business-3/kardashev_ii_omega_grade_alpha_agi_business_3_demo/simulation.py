"""Planetary scale simulation stubs for demonstration."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class SimulationState:
    energy_output_gw: float
    prosperity_index: float
    sustainability_index: float
    nash_welfare: float = 0.0
    sentient_welfare_index: float = 0.0
    free_energy: float = 0.0
    gibbs_free_energy: Optional[float] = None
    entropy: float = 0.0
    entropy_production: float = 0.0
    hamiltonian: float = 0.0
    stability_index: float = 0.0
    coordination_index: float = 0.0
    game_theory_slack: float = 0.0
    cooperation_potential: float = 0.0
    temperature: float = 0.0
    enthalpy: float = 0.0
    pressure: float = 0.0
    exergy_balance: float = 0.0
    pareto_efficiency: float = 0.0
    phase_transition_risk: float = 0.0

    def __post_init__(self) -> None:
        if self.gibbs_free_energy is None:
            self.gibbs_free_energy = self.free_energy


class PlanetarySimulation:
    """Interface for world simulators."""

    def tick(self, hours: float) -> SimulationState:  # pragma: no cover - abstract
        raise NotImplementedError

    def apply_action(self, action: Dict[str, float]) -> SimulationState:  # pragma: no cover - abstract
        raise NotImplementedError


class SyntheticEconomySim(PlanetarySimulation):
    """Simple synthetic economy simulation."""

    def __init__(self) -> None:
        self.energy_output_gw = 500_000.0
        self.prosperity_index = 0.7
        self.sustainability_index = 0.6

    def apply_action(self, action: Dict[str, float]) -> SimulationState:
        build_dyson_nodes = max(0.0, float(action.get("build_dyson_nodes", 0.0)))
        stimulus = max(0.0, float(action.get("stimulus", 0.0)))
        green_shift = max(0.0, float(action.get("green_shift", 0.0)))
        alignment_investment = max(0.0, float(action.get("alignment_investment", 0.0)))
        exergy_recovery = max(0.0, float(action.get("exergy_recovery", 0.0)))
        coordination_incentives = max(0.0, float(action.get("coordination_incentives", 0.0)))
        entropy_mitigation = max(0.0, float(action.get("entropy_mitigation", 0.0)))
        self.energy_output_gw += build_dyson_nodes * 10_000
        if exergy_recovery:
            self.energy_output_gw += exergy_recovery * 4_000
        self.prosperity_index = min(1.0, self.prosperity_index + stimulus * 0.01)
        self.sustainability_index = min(1.0, self.sustainability_index + green_shift * 0.02)
        if exergy_recovery:
            self.prosperity_index = min(1.0, self.prosperity_index + exergy_recovery * 0.004)
            self.sustainability_index = min(1.0, self.sustainability_index + exergy_recovery * 0.006)
        if alignment_investment:
            gap = self.prosperity_index - self.sustainability_index
            alignment_step = min(0.02 * alignment_investment, abs(gap))
            if gap > 0:
                self.sustainability_index = min(1.0, self.sustainability_index + alignment_step)
            elif gap < 0:
                self.prosperity_index = min(1.0, self.prosperity_index + alignment_step)
            shared_boost = 0.003 * alignment_investment
            self.prosperity_index = min(1.0, self.prosperity_index + shared_boost)
            self.sustainability_index = min(1.0, self.sustainability_index + shared_boost)
        if coordination_incentives:
            gap = self.prosperity_index - self.sustainability_index
            coordination_step = min(0.015 * coordination_incentives, abs(gap))
            if gap > 0:
                self.sustainability_index = min(1.0, self.sustainability_index + coordination_step)
            elif gap < 0:
                self.prosperity_index = min(1.0, self.prosperity_index + coordination_step)
            shared_boost = 0.002 * coordination_incentives
            self.prosperity_index = min(1.0, self.prosperity_index + shared_boost)
            self.sustainability_index = min(1.0, self.sustainability_index + shared_boost)
        if entropy_mitigation:
            cooling_penalty = entropy_mitigation * 500.0
            self.energy_output_gw = max(0.0, self.energy_output_gw - cooling_penalty)
            mitigation_boost = 0.003 * entropy_mitigation
            self.prosperity_index = min(1.0, self.prosperity_index + mitigation_boost)
            self.sustainability_index = min(1.0, self.sustainability_index + mitigation_boost)
            balance_gap = self.prosperity_index - self.sustainability_index
            balance_step = min(abs(balance_gap), 0.002 * entropy_mitigation)
            if balance_gap > 0:
                self.sustainability_index = min(1.0, self.sustainability_index + balance_step)
            elif balance_gap < 0:
                self.prosperity_index = min(1.0, self.prosperity_index + balance_step)
        return self._snapshot_state()

    def _compute_thermodynamic_metrics(self) -> dict[str, float]:
        """Compute free-energy inspired metrics for the simulated economy."""

        order_parameter = (self.prosperity_index + self.sustainability_index) / 2.0
        order_parameter = min(1.0 - 1e-6, max(1e-6, order_parameter))
        entropy = -(
            order_parameter * math.log(order_parameter)
            + (1.0 - order_parameter) * math.log(1.0 - order_parameter)
        )
        coordination_index = 1.0 - abs(self.prosperity_index - self.sustainability_index)
        coordination_index = min(1.0, max(0.0, coordination_index))
        temperature = 1.0 + (1.0 - self.sustainability_index)
        pressure = 1.0 + 0.5 * (1.0 - self.prosperity_index) + 0.5 * (1.0 - self.sustainability_index)
        volume = 1.0 + coordination_index
        internal_energy = self.energy_output_gw / 1_000_000.0
        enthalpy = internal_energy + pressure * volume
        free_energy = internal_energy - temperature * entropy
        gibbs_free_energy = enthalpy - temperature * entropy
        entropy_production = max(0.0, entropy * temperature * (1.0 - coordination_index))
        hamiltonian = -internal_energy * order_parameter
        stability_index = math.exp(-entropy) * (1.0 / (1.0 + abs(hamiltonian)))
        stability_index *= 0.5 + 0.5 * coordination_index
        stability_index = min(1.0, max(0.0, stability_index))
        nash_welfare = math.sqrt(
            max(1e-6, self.prosperity_index) * max(1e-6, self.sustainability_index)
        )
        welfare_floor = min(self.prosperity_index, self.sustainability_index)
        sentient_welfare_index = 0.55 * nash_welfare + 0.45 * welfare_floor
        game_theory_slack = min(1.0, nash_welfare * (0.5 + 0.5 * coordination_index))
        pareto_efficiency = math.sqrt(max(0.0, coordination_index) * max(0.0, nash_welfare))
        exergy_balance = 0.0
        if enthalpy:
            exergy_balance = max(-1.0, min(1.0, gibbs_free_energy / enthalpy))
        entropy_production_pressure = min(1.0, entropy_production / (1.0 + entropy))
        gibbs_stress = 0.0
        if enthalpy:
            gibbs_stress = min(1.0, abs(gibbs_free_energy) / max(1e-6, enthalpy))
        entropy_pressure = min(1.0, entropy / math.log(2.0))
        cooperation_potential = (
            0.5 * nash_welfare
            + 0.3 * coordination_index
            + 0.2 * sentient_welfare_index
        )
        cooperation_potential *= (1.0 - 0.4 * entropy_pressure) * (
            1.0 - 0.3 * entropy_production_pressure
        )
        cooperation_potential *= 1.0 - 0.3 * gibbs_stress
        cooperation_potential = min(1.0, max(0.0, cooperation_potential))
        phase_transition_risk = (
            0.5 * entropy_production_pressure
            + 0.3 * (1.0 - coordination_index)
            + 0.2 * gibbs_stress
        )
        phase_transition_risk = min(1.0, max(0.0, phase_transition_risk))
        return {
            "nash_welfare": nash_welfare,
            "sentient_welfare_index": sentient_welfare_index,
            "free_energy": free_energy,
            "gibbs_free_energy": gibbs_free_energy,
            "entropy": entropy,
            "entropy_production": entropy_production,
            "hamiltonian": hamiltonian,
            "stability_index": stability_index,
            "coordination_index": coordination_index,
            "game_theory_slack": game_theory_slack,
            "cooperation_potential": cooperation_potential,
            "temperature": temperature,
            "enthalpy": enthalpy,
            "pressure": pressure,
            "exergy_balance": exergy_balance,
            "pareto_efficiency": pareto_efficiency,
            "phase_transition_risk": phase_transition_risk,
        }

    def tick(self, hours: float) -> SimulationState:
        drift = hours / 24
        self.energy_output_gw *= 1.0 + 0.0001 * drift
        self.prosperity_index = min(1.0, self.prosperity_index + 0.0005 * drift)
        self.sustainability_index = min(1.0, self.sustainability_index + 0.0004 * drift)
        return self._snapshot_state()

    def _snapshot_state(self) -> SimulationState:
        metrics = self._compute_thermodynamic_metrics()
        return SimulationState(
            energy_output_gw=self.energy_output_gw,
            prosperity_index=self.prosperity_index,
            sustainability_index=self.sustainability_index,
            nash_welfare=metrics["nash_welfare"],
            sentient_welfare_index=metrics["sentient_welfare_index"],
            free_energy=metrics["free_energy"],
            gibbs_free_energy=metrics["gibbs_free_energy"],
            entropy=metrics["entropy"],
            entropy_production=metrics["entropy_production"],
            hamiltonian=metrics["hamiltonian"],
            stability_index=metrics["stability_index"],
            coordination_index=metrics["coordination_index"],
            game_theory_slack=metrics["game_theory_slack"],
            cooperation_potential=metrics["cooperation_potential"],
            temperature=metrics["temperature"],
            enthalpy=metrics["enthalpy"],
            pressure=metrics["pressure"],
            exergy_balance=metrics["exergy_balance"],
            pareto_efficiency=metrics["pareto_efficiency"],
            phase_transition_risk=metrics["phase_transition_risk"],
        )
