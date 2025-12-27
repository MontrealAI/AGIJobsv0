from __future__ import annotations

import math

import pytest

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.simulation import SyntheticEconomySim


def test_simulation_thermodynamic_metrics() -> None:
    sim = SyntheticEconomySim()
    state = sim.tick(hours=1.0)

    order_parameter = (state.prosperity_index + state.sustainability_index) / 2.0
    order_parameter = min(1.0 - 1e-6, max(1e-6, order_parameter))
    entropy = -(
        order_parameter * math.log(order_parameter)
        + (1.0 - order_parameter) * math.log(1.0 - order_parameter)
    )
    temperature = 1.0 + (1.0 - state.sustainability_index)
    internal_energy = state.energy_output_gw / 1_000_000.0
    free_energy = internal_energy - temperature * entropy
    hamiltonian = -internal_energy * order_parameter
    coordination_index = 1.0 - abs(state.prosperity_index - state.sustainability_index)
    stability_index = math.exp(-entropy) * (1.0 / (1.0 + abs(hamiltonian)))
    stability_index *= 0.5 + 0.5 * coordination_index
    stability_index = min(1.0, max(0.0, stability_index))
    nash_welfare = math.sqrt(
        max(1e-6, state.prosperity_index) * max(1e-6, state.sustainability_index)
    )
    game_theory_slack = min(1.0, nash_welfare * (0.5 + 0.5 * coordination_index))

    assert state.entropy == pytest.approx(entropy)
    assert state.nash_welfare == pytest.approx(nash_welfare)
    assert state.free_energy == pytest.approx(free_energy)
    assert state.hamiltonian == pytest.approx(hamiltonian)
    assert state.stability_index == pytest.approx(stability_index)
    assert state.coordination_index == pytest.approx(coordination_index)
    assert state.game_theory_slack == pytest.approx(game_theory_slack)
    assert 0.0 <= state.coordination_index <= 1.0
    assert 0.0 <= state.stability_index <= 1.0
    assert 0.0 <= state.game_theory_slack <= 1.0
    assert 0.0 <= state.nash_welfare <= 1.0
