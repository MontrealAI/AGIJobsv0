from kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade.policy import (
    build_policy_decision,
)
from kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade.simulation import (
    SyntheticEconomySim,
)


def test_policy_decision_action_bounds() -> None:
    sim = SyntheticEconomySim.from_config({})
    decision = build_policy_decision(sim.get_state())

    expected_keys = {
        "build_solar",
        "deploy_data_centers",
        "invest_in_research",
        "population_growth",
    }
    assert expected_keys.issubset(decision.action.keys())
    assert any(value > 0 for value in decision.action.values())
    for value in decision.action.values():
        assert 0.0 <= value <= 10.0
    assert decision.rationale["action_intensity"] >= 0.0


def test_policy_decision_prioritizes_prosperity_gap() -> None:
    state = {
        "prosperity_index": 0.2,
        "sustainability_index": 0.9,
        "coordination_index": 0.85,
        "nash_welfare": 0.4,
        "sentient_welfare_index": 0.35,
        "free_energy": 0.1,
        "gibbs_free_energy": -0.6,
        "entropy": 0.2,
        "hamiltonian": 0.1,
        "stability_index": 0.8,
        "game_theory_slack": 0.8,
        "temperature": 1.1,
        "enthalpy": 0.4,
        "pressure": 1.2,
    }
    decision = build_policy_decision(state)
    assert decision.action["build_solar"] >= decision.action["deploy_data_centers"]
    assert decision.action["invest_in_research"] > 0.0
