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

    assert state.entropy == pytest.approx(entropy)
    assert state.free_energy == pytest.approx(free_energy)
    assert state.hamiltonian == pytest.approx(hamiltonian)
    assert state.coordination_index == pytest.approx(coordination_index)
    assert 0.0 <= state.coordination_index <= 1.0
