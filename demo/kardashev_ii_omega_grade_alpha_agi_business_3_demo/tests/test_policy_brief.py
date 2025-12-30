from __future__ import annotations

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.simulation import SimulationState


def test_insight_payload_includes_policy_brief() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=False))
    state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.55,
        sustainability_index=0.45,
        nash_welfare=0.45,
        sentient_welfare_index=0.5,
        free_energy=0.2,
        gibbs_free_energy=-0.3,
        entropy=0.2,
        hamiltonian=-0.2,
        coordination_index=0.5,
        game_theory_slack=0.5,
        stability_index=0.6,
    )
    orchestrator._latest_simulation_state = state

    payload = orchestrator._build_insight_payload()

    brief = payload["policy_brief"]
    assert isinstance(brief["next_steps"], list)
    assert brief["next_steps"]
    assert brief["energy_dynamics"]["gibbs_reference"] == state.gibbs_free_energy
    assert brief["game_theory_snapshot"]["nash_welfare"] == state.nash_welfare
