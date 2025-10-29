"""Implementation of the Meta-Agentic α-AGI Jobs Prime pipeline phases."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from . import config as config_module
from .data_sources import Opportunity, Signal, detect_opportunities, summarise_projections, synthesise_counterfactuals


@dataclass(frozen=True)
class IdentifyResult:
    """Output of the Identify phase."""

    opportunities: tuple[Opportunity, ...]


@dataclass(frozen=True)
class LearningAsset:
    """A distilled learning artifact produced by the Out-Learn phase."""

    domain: str
    playbook: str
    reinforcement_signal: float


@dataclass(frozen=True)
class LearnResult:
    assets: tuple[LearningAsset, ...]
    counterfactuals: dict[str, dict[str, float]]
    opportunities: dict[str, Opportunity]


@dataclass(frozen=True)
class ReasonedPlan:
    """Detailed plan produced by the Out-Think phase."""

    opportunity: Opportunity
    rationale: str
    projected_reward: float
    safeguards: tuple[str, ...]


@dataclass(frozen=True)
class DesignArtifact:
    """High-fidelity design for executing on an opportunity."""

    plan: ReasonedPlan
    blueprint: str
    resource_requirements: dict[str, float]


@dataclass(frozen=True)
class Strategy:
    """Portfolio aware strategy selection."""

    design: DesignArtifact
    priority: int
    allocation: float
    stop_conditions: tuple[str, ...]


@dataclass(frozen=True)
class ExecutionOrder:
    """Executable command list for the Out-Execute phase."""

    strategy: Strategy
    actions: tuple[str, ...]
    monitoring_hooks: tuple[str, ...]


class IdentifyPhase:
    def __init__(self, cfg: config_module.MetaAgenticConfig):
        self._cfg = cfg

    def run(self, signals: Sequence[Signal]) -> IdentifyResult:
        opportunities = detect_opportunities(
            signals,
            threshold=self._cfg.data_pipeline.anomaly_threshold,
            max_results=self._cfg.owner.max_concurrent_initiatives,
            risk_floor=max(self._cfg.owner.risk_limit / 2, 0.05),
        )
        return IdentifyResult(opportunities=tuple(opportunities))


class OutLearnPhase:
    def __init__(self, cfg: config_module.MetaAgenticConfig):
        self._cfg = cfg

    def run(self, identify_result: IdentifyResult) -> LearnResult:
        assets: list[LearningAsset] = []
        counterfactuals: dict[str, dict[str, float]] = {}
        opportunity_lookup: dict[str, Opportunity] = {}
        for opportunity in identify_result.opportunities:
            reinforcement = opportunity.risk_adjusted_score()
            assets.append(
                LearningAsset(
                    domain=opportunity.domain,
                    playbook=self._build_playbook(opportunity),
                    reinforcement_signal=reinforcement,
                )
            )
            opportunity_lookup[opportunity.domain] = opportunity
            projections = synthesise_counterfactuals(
                opportunity,
                samples=self._cfg.simulation.monte_carlo_samples,
            )
            counterfactuals[opportunity.domain] = summarise_projections(projections)
        return LearnResult(assets=tuple(assets), counterfactuals=counterfactuals, opportunities=opportunity_lookup)

    def _build_playbook(self, opportunity: Opportunity) -> str:
        return (
            f"Deploy adaptive curriculum targeting {opportunity.domain} anomalies. "
            f"Utilise simulation horizon of {self._cfg.simulation.horizon_days} days "
            f"with {self._cfg.simulation.stress_test_shocks} stress tests."
        )


class OutThinkPhase:
    def __init__(self, cfg: config_module.MetaAgenticConfig):
        self._cfg = cfg

    def run(self, learn_result: LearnResult) -> tuple[ReasonedPlan, ...]:
        plans: list[ReasonedPlan] = []
        for asset in learn_result.assets:
            rationale = (
                f"Cross-analyse {asset.domain} opportunity with reinforcement signal "
                f"{asset.reinforcement_signal:.3f}. "
                "Blend symbolic governance constraints with world model forecasts."
            )
            safeguards = (
                "Pre-trade simulation on LayerZero sandbox",
                "Timelocked governance checkpoint",
                "Validator overseer approval",
            )
            plans.append(
                ReasonedPlan(
                    opportunity=self._find_opportunity(learn_result, asset.domain),
                    rationale=rationale,
                    projected_reward=asset.reinforcement_signal,
                    safeguards=safeguards,
                )
            )
        return tuple(plans)

    def _find_opportunity(self, learn_result: LearnResult, domain: str) -> Opportunity:
        opportunity = learn_result.opportunities.get(domain)
        if opportunity is None:
            raise ValueError(f"Opportunity for domain {domain!r} not found")
        return opportunity


class OutDesignPhase:
    def __init__(self, cfg: config_module.MetaAgenticConfig):
        self._cfg = cfg

    def run(self, plans: Iterable[ReasonedPlan]) -> tuple[DesignArtifact, ...]:
        artifacts: list[DesignArtifact] = []
        for plan in plans:
            blueprint = (
                f"Design fully automated executor for {plan.opportunity.domain} leveraging "
                "AGI Jobs toolchain with synthetic agents, treasury guards, and UI summaries."
            )
            resources = {
                "capital_allocation": max(1.0, plan.projected_reward * 1.2),
                "agent_threads": float(self._cfg.owner.max_concurrent_initiatives),
                "validator_budget": 0.15,
            }
            artifacts.append(
                DesignArtifact(
                    plan=plan,
                    blueprint=blueprint,
                    resource_requirements=resources,
                )
            )
        return tuple(artifacts)


class OutStrategisePhase:
    def __init__(self, cfg: config_module.MetaAgenticConfig):
        self._cfg = cfg

    def run(self, designs: Iterable[DesignArtifact]) -> tuple[Strategy, ...]:
        strategies: list[Strategy] = []
        for priority, design in enumerate(designs, start=1):
            allocation = min(1.0, design.plan.projected_reward / max(self._cfg.owner.risk_limit, 0.01))
            stop_conditions = (
                "Loss exceeds risk limit",
                "Governance council veto",
                "External market shock detected",
            )
            strategies.append(
                Strategy(
                    design=design,
                    priority=priority,
                    allocation=allocation,
                    stop_conditions=stop_conditions,
                )
            )
        return tuple(strategies)


class OutExecutePhase:
    def __init__(self, cfg: config_module.MetaAgenticConfig):
        self._cfg = cfg

    def run(self, strategies: Iterable[Strategy]) -> tuple[ExecutionOrder, ...]:
        orders: list[ExecutionOrder] = []
        for strategy in strategies:
            actions = self._build_actions(strategy)
            monitoring_hooks = (
                "Real-time alpha telemetry",
                "On-chain event stream watcher",
                "Continuous compliance analytics",
            )
            orders.append(
                ExecutionOrder(
                    strategy=strategy,
                    actions=actions,
                    monitoring_hooks=monitoring_hooks,
                )
            )
        return tuple(orders)

    def _build_actions(self, strategy: Strategy) -> tuple[str, ...]:
        design = strategy.design
        domain = design.plan.opportunity.domain
        return (
            f"Spawn orchestrator agents for {domain}",
            f"Deploy treasury plan with allocation {strategy.allocation:.2f}",
            "Register governance proposal via AGI Jobs timelock",
            "Launch validator challenge-response monitors",
        )

