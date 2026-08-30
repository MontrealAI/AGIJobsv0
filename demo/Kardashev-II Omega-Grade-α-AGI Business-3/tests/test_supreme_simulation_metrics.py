from __future__ import annotations

import math

import pytest

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme.simulation import (
    SyntheticEconomySim,
)


def test_supreme_simulation_thermodynamics_are_consistent() -> None:
    sim = SyntheticEconomySim(
        population=7_500_000_000,
        energy_output=1_250_000.0,
        compute_output=4_000_000.0,
        stress_index=0.2,
    )

    state = sim.get_state()

    order_parameter = 1.0 - state.stress_index
    order_parameter = min(1.0 - 1e-6, max(1e-6, order_parameter))
    entropy = -(
        order_parameter * math.log(order_parameter)
        + (1.0 - order_parameter) * math.log(1.0 - order_parameter)
    )
    temperature = 1.0 + state.stress_index
    internal_energy = (state.energy_output / 1_000_000.0) + (state.compute_output / 2_000_000.0)
    gibbs_free_energy = internal_energy - temperature * entropy
    hamiltonian = -internal_energy * order_parameter
    total_output = state.energy_output + state.compute_output
    balance = state.energy_output / total_output
    coordination_index = 1.0 - abs(balance - 0.5) * 2.0

    assert state.entropy == pytest.approx(entropy)
    assert state.temperature == pytest.approx(temperature)
    assert state.gibbs_free_energy == pytest.approx(gibbs_free_energy)
    assert state.hamiltonian == pytest.approx(hamiltonian)
    assert state.coordination_index == pytest.approx(coordination_index)
    assert 0.0 <= state.coordination_index <= 1.0
