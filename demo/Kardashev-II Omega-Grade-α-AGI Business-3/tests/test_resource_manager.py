from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.resources import ResourceManager


def test_ensure_account_mints_when_topping_up_existing_account():
    resources = ResourceManager(energy_capacity=1.0, compute_capacity=1.0, base_token_supply=100.0)

    account = resources.ensure_account("operator", 100.0)
    assert account.tokens == 100.0
    assert resources.token_supply == 100.0

    resources.debit_tokens("operator", 60.0)
    assert resources.get_account("operator").tokens == 40.0
    assert resources.token_supply == 40.0

    # Topping up should mint the delta and keep the ledger balanced.
    resources.ensure_account("operator", 80.0)
    assert resources.get_account("operator").tokens == 80.0
    assert resources.token_supply == 80.0
