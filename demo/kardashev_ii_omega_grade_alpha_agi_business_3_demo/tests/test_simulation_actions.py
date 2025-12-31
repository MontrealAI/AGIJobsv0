from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.simulation import SimulationState
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.jobs import JobRecord, JobSpec, JobStatus


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
    assert orchestrator._last_simulation_action["rationale"]["policy_source"] == "operator"


def test_simulation_policy_auto_generates_action() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    assert orchestrator.simulation is not None

    asyncio.run(orchestrator._handle_simulation_action({"policy": "auto"}))

    assert orchestrator._last_simulation_action is not None
    assert orchestrator._last_simulation_action["policy"] == "auto"
    assert "build_dyson_nodes" in orchestrator._last_simulation_action["action"]
    assert orchestrator._last_simulation_action["rationale"]["policy_source"] == "autonomous"


def test_simulation_operator_action_respects_payload() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    assert orchestrator.simulation is not None

    asyncio.run(
        orchestrator._handle_simulation_action(
            {
                "policy": "operator",
                "action_payload": {
                    "build_dyson_nodes": 4.0,
                    "stimulus": 1.0,
                    "green_shift": 2.0,
                },
            }
        )
    )

    assert orchestrator._last_simulation_action is not None
    assert orchestrator._last_simulation_action["policy"] == "operator"
    assert orchestrator._last_simulation_action["action"]["build_dyson_nodes"] == 4.0
    assert orchestrator._last_simulation_action["rationale"]["policy_source"] == "operator"


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


def test_policy_action_accounts_for_sentient_welfare() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    low_welfare_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.4,
        sustainability_index=0.4,
        nash_welfare=0.4,
        sentient_welfare_index=0.2,
        free_energy=0.2,
        entropy=0.2,
        hamiltonian=-0.1,
        coordination_index=0.5,
        game_theory_slack=0.5,
        stability_index=0.6,
    )
    high_welfare_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.4,
        sustainability_index=0.4,
        nash_welfare=0.4,
        sentient_welfare_index=0.9,
        free_energy=0.2,
        entropy=0.2,
        hamiltonian=-0.1,
        coordination_index=0.5,
        game_theory_slack=0.5,
        stability_index=0.6,
    )

    low_action = orchestrator._build_policy_action(low_welfare_state)
    high_action = orchestrator._build_policy_action(high_welfare_state)

    assert low_action["stimulus"] >= high_action["stimulus"]
    assert low_action["green_shift"] >= high_action["green_shift"]


def test_policy_action_escalates_for_low_welfare_floor() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    low_floor_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.6,
        sustainability_index=0.3,
        nash_welfare=0.42,
        sentient_welfare_index=0.45,
        free_energy=0.2,
        entropy=0.2,
        hamiltonian=-0.1,
        coordination_index=0.6,
        game_theory_slack=0.6,
        stability_index=0.6,
    )
    high_floor_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.6,
        sustainability_index=0.6,
        nash_welfare=0.6,
        sentient_welfare_index=0.6,
        free_energy=0.2,
        entropy=0.2,
        hamiltonian=-0.1,
        coordination_index=0.6,
        game_theory_slack=0.6,
        stability_index=0.6,
    )

    low_action = orchestrator._build_policy_action(low_floor_state)
    high_action = orchestrator._build_policy_action(high_floor_state)

    assert low_action["alignment_investment"] >= high_action["alignment_investment"]


def test_policy_action_invests_in_alignment_for_coordination_gap() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    low_coordination_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.7,
        sustainability_index=0.2,
        nash_welfare=0.4,
        sentient_welfare_index=0.4,
        free_energy=0.4,
        entropy=0.4,
        hamiltonian=-0.2,
        coordination_index=0.2,
        game_theory_slack=0.3,
        stability_index=0.5,
    )
    high_coordination_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.6,
        sustainability_index=0.6,
        nash_welfare=0.6,
        sentient_welfare_index=0.7,
        free_energy=0.2,
        entropy=0.2,
        hamiltonian=-0.1,
        coordination_index=0.9,
        game_theory_slack=0.8,
        stability_index=0.8,
    )

    low_action = orchestrator._build_policy_action(low_coordination_state)
    high_action = orchestrator._build_policy_action(high_coordination_state)

    assert low_action["alignment_investment"] >= high_action["alignment_investment"]


def test_policy_action_escalates_alignment_when_entropy_high() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    low_entropy_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.55,
        sustainability_index=0.45,
        nash_welfare=0.45,
        sentient_welfare_index=0.5,
        free_energy=0.1,
        entropy=0.1,
        hamiltonian=-0.2,
        coordination_index=0.5,
        game_theory_slack=0.5,
        stability_index=0.6,
    )
    high_entropy_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.55,
        sustainability_index=0.45,
        nash_welfare=0.45,
        sentient_welfare_index=0.5,
        free_energy=0.1,
        entropy=0.9,
        hamiltonian=-0.2,
        coordination_index=0.5,
        game_theory_slack=0.5,
        stability_index=0.6,
    )

    low_action = orchestrator._build_policy_action(low_entropy_state)
    high_action = orchestrator._build_policy_action(high_entropy_state)

    assert high_action["alignment_investment"] >= low_action["alignment_investment"]
    assert high_action["build_dyson_nodes"] <= low_action["build_dyson_nodes"]


def test_policy_action_responds_to_gibbs_deficit() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=True))
    baseline_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.55,
        sustainability_index=0.45,
        nash_welfare=0.45,
        sentient_welfare_index=0.5,
        free_energy=0.2,
        gibbs_free_energy=0.2,
        entropy=0.2,
        hamiltonian=-0.2,
        coordination_index=0.5,
        game_theory_slack=0.5,
        stability_index=0.6,
    )
    deficit_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.55,
        sustainability_index=0.45,
        nash_welfare=0.45,
        sentient_welfare_index=0.5,
        free_energy=0.2,
        gibbs_free_energy=-0.4,
        entropy=0.2,
        hamiltonian=-0.2,
        coordination_index=0.5,
        game_theory_slack=0.5,
        stability_index=0.6,
    )

    baseline_action = orchestrator._build_policy_action(baseline_state)
    deficit_action = orchestrator._build_policy_action(deficit_state)

    assert deficit_action["build_dyson_nodes"] >= baseline_action["build_dyson_nodes"]


def test_select_best_claimant_prefers_skill_match_and_capacity() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=False))
    job_spec = JobSpec(
        title="Grid Stabilization",
        description="Balance planetary grids.",
        required_skills=["energy-architect", "supply-chain"],
        reward_tokens=500.0,
        deadline=datetime.now(timezone.utc) + timedelta(hours=1),
        validation_window=timedelta(minutes=30),
    )
    job = JobRecord(
        job_id="job-1",
        spec=job_spec,
        status=JobStatus.POSTED,
        created_at=datetime.now(timezone.utc),
    )
    orchestrator._agent_skills = {
        "energy-architect": ["energy-architect", "supply-chain"],
        "supply-chain": ["supply-chain"],
    }
    orchestrator._unresponsive_agents = {"supply-chain"}

    selected = orchestrator._select_best_claimant(job, ["energy-architect", "supply-chain"])

    assert selected == "energy-architect"
