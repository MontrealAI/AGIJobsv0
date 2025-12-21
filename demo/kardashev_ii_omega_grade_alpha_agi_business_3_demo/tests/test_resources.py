from __future__ import annotations

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.resources import ResourceManager


def test_lock_stake_mints_when_underfunded():
    manager = ResourceManager(energy_capacity=1_000_000, compute_capacity=5_000_000, base_token_supply=0)

    manager.lock_stake("validator-1", 1_200)

    account = manager.get_account("validator-1")
    assert account.locked == 1_200
    assert account.tokens == 0
    assert manager.token_supply == 0


def test_restore_state_rehydrates_reservations_and_clamps_availability():
    manager = ResourceManager(energy_capacity=1_000, compute_capacity=2_000, base_token_supply=100)
    manager.reserve_budget("job-1", energy=200, compute=500)
    manager.reserve_budget("job-2", energy=50, compute=250)

    serialized = manager.to_serializable()
    state = serialized["state"]
    state["reservations"] = serialized["reservations"]

    restored = ResourceManager(energy_capacity=5_000, compute_capacity=5_000, base_token_supply=0)
    restored.restore_state(state)

    assert restored.reservation_for("job-1") == (200, 500)
    assert restored.reservation_for("job-2") == (50, 250)
    # Availability should never exceed the residual capacity after reservations.
    assert restored.energy_available == restored.energy_capacity - restored.reserved_energy
    assert restored.compute_available == restored.compute_capacity - restored.reserved_compute
