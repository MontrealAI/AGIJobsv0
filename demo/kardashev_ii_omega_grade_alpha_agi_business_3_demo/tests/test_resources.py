from __future__ import annotations

import pytest

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


def test_restore_state_rehydrates_accounts_from_serialized_payload() -> None:
    manager = ResourceManager(energy_capacity=500, compute_capacity=800, base_token_supply=0)
    manager.adjust_account(
        "validator-1", tokens=300, locked=120, energy_quota=50, compute_quota=75
    )
    manager.adjust_account("validator-2", tokens=50, locked=0, energy_quota=20, compute_quota=10)
    manager.reserve_budget("job-42", energy=40, compute=60)

    serialized = manager.to_serializable()

    restored = ResourceManager(energy_capacity=0, compute_capacity=0, base_token_supply=0)
    restored.restore_state(serialized)

    restored_validator = restored.get_account("validator-1")
    assert restored_validator.tokens == 300
    assert restored_validator.locked == 120
    assert restored_validator.energy_quota == 50
    assert restored_validator.compute_quota == 75
    assert restored.token_supply == serialized["state"]["token_supply"]
    assert restored.locked_supply == 120
    assert restored.energy_capacity == 500
    assert restored.compute_capacity == 800
    assert restored.reservation_for("job-42") == (40, 60)


def test_restore_state_clears_accounts_and_ledger_when_absent() -> None:
    manager = ResourceManager(energy_capacity=1_000, compute_capacity=1_000, base_token_supply=0)
    manager.adjust_account("validator-1", tokens=500, locked=200, energy_quota=50, compute_quota=75)
    manager.reserve_budget("job-old", energy=100, compute=150)

    payload = {
        "state": {
            "energy_capacity": 2_000,
            "compute_capacity": 3_000,
            "energy_available": 1_500,
            "compute_available": 2_500,
        }
    }

    manager.restore_state(payload)

    with pytest.raises(KeyError):
        manager.get_account("validator-1")
    assert manager.token_supply == 0
    assert manager.reserved_energy == 0
    assert manager.reserved_compute == 0
    assert manager.energy_available == 1_500
    assert manager.compute_available == 2_500
