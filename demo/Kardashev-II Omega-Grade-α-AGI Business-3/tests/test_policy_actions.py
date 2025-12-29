from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.simulation import SimulationState


def test_autonomous_policy_action_updates_simulation(tmp_path: Path) -> None:
    async def _run() -> None:
        config = OrchestratorConfig(
            max_cycles=None,
            cycle_sleep_seconds=0.05,
            checkpoint_interval_seconds=5,
            enable_simulation=True,
            simulation_tick_seconds=0.02,
            simulation_hours_per_tick=0.01,
            auto_policy_actions=True,
            policy_action_interval_seconds=0.02,
            control_channel_file=tmp_path / "control.jsonl",
            checkpoint_path=tmp_path / "checkpoint.json",
            status_output_path=None,
            audit_log_path=None,
            energy_oracle_path=None,
        )
        orchestrator = Orchestrator(config)
        try:
            await orchestrator.start()

            async def _wait_for_action() -> None:
                while orchestrator._last_simulation_action is None:
                    await asyncio.sleep(0.01)

            await asyncio.wait_for(_wait_for_action(), timeout=2)
            assert orchestrator._last_simulation_action is not None
        finally:
            await orchestrator.shutdown()

    asyncio.run(_run())


def test_policy_signals_use_gibbs_deficit(tmp_path: Path) -> None:
    orchestrator = Orchestrator(
        OrchestratorConfig(
            control_channel_file=tmp_path / "control.jsonl",
            checkpoint_path=tmp_path / "checkpoint.json",
            status_output_path=None,
            audit_log_path=None,
            energy_oracle_path=None,
        )
    )
    state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.7,
        sustainability_index=0.6,
        free_energy=-0.5,
        entropy=0.4,
        hamiltonian=-0.3,
        stability_index=0.8,
        coordination_index=0.9,
        nash_welfare=0.65,
        sentient_welfare_index=0.6,
        game_theory_slack=0.7,
    )

    signals = orchestrator._compute_policy_signals(state)

    assert signals["gibbs_drive"] == pytest.approx(0.5)
