from __future__ import annotations

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.resources import ResourceManager


def test_lock_stake_mints_when_underfunded():
    manager = ResourceManager(energy_capacity=1_000_000, compute_capacity=5_000_000, base_token_supply=0)

    manager.lock_stake("validator-1", 1_200)

    account = manager.get_account("validator-1")
    assert account.locked == 1_200
    assert account.tokens == 0
    assert manager.token_supply == 0
