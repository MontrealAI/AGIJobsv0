"""Public package interface for the Meta-Agentic Program Synthesis demo."""

from .admin import OwnerConsole, load_owner_overrides
from .config import DemoConfig, DemoScenario, EvolutionPolicy, RewardPolicy, StakePolicy
from .entities import DemoRunArtifacts
from .governance import GovernanceTimelock, TimelockedAction
from .orchestrator import SovereignArchitect, generate_dataset
from .report import export_report, render_html

__all__ = [
    "DemoConfig",
    "DemoScenario",
    "DemoRunArtifacts",
    "EvolutionPolicy",
    "RewardPolicy",
    "StakePolicy",
    "OwnerConsole",
    "SovereignArchitect",
    "generate_dataset",
    "export_report",
    "render_html",
    "load_owner_overrides",
    "GovernanceTimelock",
    "TimelockedAction",
]
