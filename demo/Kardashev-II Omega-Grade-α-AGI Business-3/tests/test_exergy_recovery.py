from __future__ import annotations

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.simulation import SyntheticEconomySim


def test_exergy_recovery_boosts_energy_and_stability() -> None:
    sim = SyntheticEconomySim()
    initial_state = sim.tick(hours=0.0)

    updated_state = sim.apply_action({"exergy_recovery": 4.0})

    assert updated_state.energy_output_gw > initial_state.energy_output_gw
    assert updated_state.sustainability_index >= initial_state.sustainability_index
    assert updated_state.prosperity_index >= initial_state.prosperity_index
