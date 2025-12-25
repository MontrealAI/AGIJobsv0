from __future__ import annotations

import asyncio

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.simulation import SimulationState


def test_simulation_action_updates_resources() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    assert orchestrator.simulation is not None

    initial_capacity = orchestrator.resources.energy_capacity

    asyncio.run(
        orchestrator._handle_simulation_action(
            {
                "action_payload": {
                    "build_dyson_nodes": 2,
                    "stimulus": 3.0,
                    "green_shift": 1.0,
                }
            }
        )
    )

    assert orchestrator._latest_simulation_state is not None
    assert orchestrator.resources.energy_capacity >= initial_capacity
    assert orchestrator._last_simulation_action is not None
    assert orchestrator._last_simulation_action["action"]["build_dyson_nodes"] == 2.0


def test_simulation_policy_auto_generates_action() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    assert orchestrator.simulation is not None

    asyncio.run(orchestrator._handle_simulation_action({"policy": "auto"}))

    assert orchestrator._last_simulation_action is not None
    assert orchestrator._last_simulation_action["policy"] == "auto"
    assert "build_dyson_nodes" in orchestrator._last_simulation_action["action"]


def test_policy_action_accounts_for_compute_scarcity() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    low_coordination_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.2,
        sustainability_index=0.2,
        free_energy=0.3,
        entropy=0.5,
        hamiltonian=-0.2,
        coordination_index=0.3,
        game_theory_slack=0.4,
    )

    baseline_action = orchestrator._build_policy_action(low_coordination_state)

    orchestrator.resources.update_capacity(
        compute_available=orchestrator.resources.compute_capacity * 0.1
    )
    scarcity_action = orchestrator._build_policy_action(low_coordination_state)

    assert scarcity_action["stimulus"] >= baseline_action["stimulus"]
    assert scarcity_action["green_shift"] >= baseline_action["green_shift"]
