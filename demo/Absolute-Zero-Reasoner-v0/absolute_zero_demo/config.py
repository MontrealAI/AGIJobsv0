"""Centralised configuration for the Absolute Zero Reasoner demo.

The configuration is intentionally explicit so that non-technical operators can
change behaviour without editing code. Every parameter includes documentation
on operational impact.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List


@dataclass
class GuardrailThresholds:
    """Safety limits enforced during training."""

    max_iterations: int = 250
    max_runtime_seconds: float = 120.0
    max_consecutive_failures: int = 5
    max_budget_usd: float = 2.5
    target_success_rate: float = 0.55
    min_diversity_score: float = 0.35


@dataclass
class RewardWeights:
    """Weights for composing proposer and solver rewards."""

    learnability: float = 1.0
    correctness: float = 1.0
    economic_utility: float = 0.25
    format_penalty: float = -0.5


@dataclass
class EconomicAssumptions:
    """Business assumptions for the economic utility calculator."""

    baseline_human_cost_per_hour: float = 175.0
    average_task_minutes_saved: float = 12.5
    onchain_transaction_cost_usd: float = 0.12
    compute_cost_per_second: float = 0.00045
    marketplace_fee_share: float = 0.12


@dataclass
class PromptTemplates:
    """Prompt snippets used to communicate with foundation models."""

    proposer_header: str = (
        "You are Absolute Zero Proposer running inside AGI Jobs v2. "
        "Generate resilient self-evaluation tasks that expand the "
        "platform's capabilities. Use structured markdown blocks."
    )
    solver_header: str = (
        "You are Absolute Zero Solver. Produce only the requested artifact "
        "inside a fenced block so automated verification can execute it."
    )
    format_footer: str = (
        "Remember: output strictly in the required fenced block. No prose, "
        "no commentary, no apologies."
    )


@dataclass
class ExecutionPolicy:
    """Constraints for sandbox execution."""

    timeout_seconds: float = 3.5
    memory_limit_mb: int = 256
    banned_tokens: Iterable[str] = (
        "import os",
        "import sys",
        "import subprocess",
        "import socket",
        "import shutil",
        "open(",
        "__import__",
        "eval("
    )
    determinism_runs: int = 2


@dataclass
class DemoConfig:
    """Configuration surface for the demo orchestrator."""

    batch_size: int = 3
    proposer_temperature: float = 0.65
    solver_temperature: float = 0.35
    reward_weights: RewardWeights = field(default_factory=RewardWeights)
    economic_assumptions: EconomicAssumptions = field(default_factory=EconomicAssumptions)
    guardrails: GuardrailThresholds = field(default_factory=GuardrailThresholds)
    prompts: PromptTemplates = field(default_factory=PromptTemplates)
    execution_policy: ExecutionPolicy = field(default_factory=ExecutionPolicy)
    telemetry_window: int = 25
    seed_tasks: List[Dict[str, str]] = field(
        default_factory=lambda: [
            {
                "program": "def identity(x):\n    return x",
                "input": "{\"value\": 42}",
                "output": "{\"value\": 42}"
            }
        ]
    )

    def banned_phrases(self) -> List[str]:
        """Return a mutable copy of banned tokens for runtime checks."""

        return list(self.execution_policy.banned_tokens)
