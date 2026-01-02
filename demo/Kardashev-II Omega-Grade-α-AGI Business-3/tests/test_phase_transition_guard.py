from __future__ import annotations

from pathlib import Path

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.simulation import SimulationState


def test_phase_transition_guard_pauses_and_resumes(tmp_path: Path) -> None:
    orchestrator = Orchestrator(
        OrchestratorConfig(
            control_channel_file=tmp_path / "control.jsonl",
            checkpoint_path=tmp_path / "checkpoint.json",
            status_output_path=None,
            audit_log_path=None,
            energy_oracle_path=None,
            auto_pause_on_phase_transition=True,
            phase_transition_pause_threshold=0.6,
            phase_transition_resume_threshold=0.4,
        )
    )

    high_risk_state = SimulationState(
        energy_output_gw=500_000.0,
        prosperity_index=0.7,
        sustainability_index=0.6,
        phase_transition_risk=0.75,
    )
    orchestrator._apply_simulation_state(high_risk_state, event="simulation_tick")

    assert orchestrator._phase_transition_paused is True
    assert not orchestrator._paused.is_set()

    low_risk_state = SimulationState(
        energy_output_gw=505_000.0,
        prosperity_index=0.72,
        sustainability_index=0.62,
        phase_transition_risk=0.3,
    )
    orchestrator._apply_simulation_state(low_risk_state, event="simulation_tick")

    assert orchestrator._phase_transition_paused is False
    assert orchestrator._paused.is_set()
