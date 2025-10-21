"""Public package interface for the Meta-Agentic Program Synthesis demo."""

from .config import DemoConfig, DemoScenario, EvolutionPolicy, RewardPolicy, StakePolicy
from .entities import DemoRunArtifacts
from .orchestrator import SovereignArchitect, generate_dataset
from .report import export_report, render_html

__all__ = [
    "DemoConfig",
    "DemoScenario",
    "DemoRunArtifacts",
    "EvolutionPolicy",
    "RewardPolicy",
    "StakePolicy",
    "SovereignArchitect",
    "generate_dataset",
    "export_report",
    "render_html",
]
