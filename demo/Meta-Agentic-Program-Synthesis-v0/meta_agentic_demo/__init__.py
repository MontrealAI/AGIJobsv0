"""Public package interface for the Meta-Agentic Program Synthesis demo."""

from .admin import OwnerConsole, load_owner_overrides
from .config import (
    DemoConfig,
    DemoScenario,
    EvolutionPolicy,
    RewardPolicy,
    StakePolicy,
    VerificationPolicy,
)
from .entities import DemoRunArtifacts, OpportunitySynopsis, RewardSummary
from .governance import GovernanceTimelock, TimelockedAction
from .orchestrator import SovereignArchitect, generate_dataset
from .report import export_report, render_html

__all__ = [
    "DemoConfig",
    "DemoScenario",
    "DemoRunArtifacts",
    "OpportunitySynopsis",
    "RewardSummary",
    "EvolutionPolicy",
    "RewardPolicy",
    "StakePolicy",
    "VerificationPolicy",
    "OwnerConsole",
    "SovereignArchitect",
    "generate_dataset",
    "export_report",
    "render_html",
    "load_owner_overrides",
    "GovernanceTimelock",
    "TimelockedAction",
]
