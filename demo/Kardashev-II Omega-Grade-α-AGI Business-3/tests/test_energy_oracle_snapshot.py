from __future__ import annotations

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)


def test_energy_oracle_snapshot_exposes_welfare_metrics() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    assert orchestrator.simulation is not None
    state = orchestrator.simulation.tick(hours=0.0)
    orchestrator._apply_simulation_state(state, event="simulation_tick")

    snapshot = orchestrator._collect_energy_snapshot()
    simulation = snapshot["simulation"]

    assert simulation is not None
    assert simulation["sentient_welfare_index"] == state.sentient_welfare_index
    assert simulation["nash_welfare"] == state.nash_welfare
    assert "equilibrium_forecast" in simulation
    forecast = simulation["equilibrium_forecast"]
    assert 0.0 <= forecast["forecasted_welfare"] <= 1.0
    assert 0.0 <= forecast["cooperation_target"] <= 1.0
