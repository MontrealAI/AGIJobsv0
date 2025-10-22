"""Public package interface for the Meta-Agentic Program Synthesis demo."""

from .admin import OwnerConsole, load_owner_overrides
from .assurance import IndependentAuditor
from .config import (
    DatasetProfile,
    DemoConfig,
    DemoScenario,
    EvolutionPolicy,
    RewardPolicy,
    StakePolicy,
    VerificationPolicy,
)
from .dashboard import DashboardBundle, export_dashboard, render_dashboard_html
from .entities import DemoRunArtifacts, OpportunitySynopsis, RewardSummary
from .governance import GovernanceTimelock, TimelockedAction
from .orchestrator import SovereignArchitect, generate_dataset
from .report import export_batch_report, export_report, render_batch_html, render_html
from .scenarios import resolve_scenarios, serialise_scenarios

__all__ = [
    "DatasetProfile",
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
    "IndependentAuditor",
    "SovereignArchitect",
    "generate_dataset",
    "export_report",
    "export_batch_report",
    "export_dashboard",
    "render_html",
    "render_batch_html",
    "render_dashboard_html",
    "load_owner_overrides",
    "GovernanceTimelock",
    "TimelockedAction",
    "DashboardBundle",
    "resolve_scenarios",
    "serialise_scenarios",
]
