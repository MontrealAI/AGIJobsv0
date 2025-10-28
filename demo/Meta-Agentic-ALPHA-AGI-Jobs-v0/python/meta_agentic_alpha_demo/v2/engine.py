"""Execution harness for the Meta-Agentic α-AGI Jobs Demo V2."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Sequence

from orchestrator.agents import AgentRegistryError, get_registry
from orchestrator.models import (
    AgentCapability,
    AgentRegistrationIn,
    AgentSecurityControls,
    AgentStake,
    Attachment,
    JobIntent,
    OrchestrationPlan,
    Step,
)

from .configuration import MetaAgenticV2Configuration, PhaseDefinition


_CAPABILITY_MAP: Mapping[str, AgentCapability] = {
    "execution": AgentCapability.EXECUTION,
    "validation": AgentCapability.VALIDATION,
    "analysis": AgentCapability.ANALYSIS,
    "analytics": AgentCapability.ANALYSIS,
    "strategy": AgentCapability.ANALYSIS,
    "oversight": AgentCapability.SUPPORT,
    "support": AgentCapability.SUPPORT,
    "router": AgentCapability.ROUTER,
}


@dataclass
class PhaseScore:
    """Runtime evaluation of a scenario phase."""

    phase_id: str
    label: str
    weight: float
    success_metric: str
    state: str
    completion_ratio: float


@dataclass
class MetaAgenticV2Outcome:
    """Aggregate artefacts emitted by :func:`run_demo`."""

    run_id: str
    plan: OrchestrationPlan
    status: Any
    summary_path: Path
    phase_scores: Sequence[PhaseScore]
    scoreboard_snapshot: Mapping[str, Any]
    metadata: Mapping[str, Any] = field(default_factory=dict)


def _ensure_environment(base_dir: Path) -> Dict[str, Path]:
    storage_root = base_dir / "storage" / "orchestrator_v2"
    storage_root.mkdir(parents=True, exist_ok=True)
    (storage_root / "agents").mkdir(parents=True, exist_ok=True)
    (storage_root / "runs").mkdir(parents=True, exist_ok=True)
    (base_dir / "reports").mkdir(parents=True, exist_ok=True)
    (base_dir / "ui").mkdir(parents=True, exist_ok=True)

    defaults = {
        "ORCHESTRATOR_BRIDGE_MODE": "python",
        "ORCHESTRATOR_SCOREBOARD_PATH": storage_root / "scoreboard.json",
        "ORCHESTRATOR_CHECKPOINT_PATH": storage_root / "checkpoint.json",
        "ORCHESTRATOR_CHECKPOINT_LEVELDB": storage_root / "checkpoint.db",
        "ORCHESTRATOR_GOVERNANCE_PATH": storage_root / "governance.json",
        "ORCHESTRATOR_STATE_DIR": storage_root / "runs",
        "AGENT_REGISTRY_PATH": storage_root / "agents" / "registry.json",
    }

    for key, value in defaults.items():
        os.environ.setdefault(key, str(value))

    return {key: Path(str(value)) for key, value in defaults.items()}


def _map_capabilities(entries: Iterable[str]) -> List[AgentCapability]:
    capabilities: List[AgentCapability] = []
    for entry in entries:
        capability = _CAPABILITY_MAP.get(entry.lower())
        if capability:
            capabilities.append(capability)
    if not capabilities:
        capabilities.append(AgentCapability.EXECUTION)
    return capabilities


def _register_agents(config: MetaAgenticV2Configuration) -> List[str]:
    registry = get_registry()
    onboarded: List[str] = []
    existing = {agent.agent_id for agent in registry.list().agents}
    for agent_cfg in config.agents:
        payload = dict(agent_cfg.payload)
        agent_id = agent_cfg.agent_id
        if agent_id in existing:
            onboarded.append(agent_id)
            continue
        stake_amount = Decimal(str(payload.get("stake_amount", "0")))
        registration = AgentRegistrationIn(
            agent_id=agent_id,
            owner=str(payload.get("owner", "Meta-Agentic Demo Owner")),
            region=str(payload.get("region", "global")),
            capabilities=_map_capabilities(payload.get("capabilities", []) or []),
            stake=AgentStake(amount=stake_amount, slashable=bool(payload.get("slashable", True))),
            security=AgentSecurityControls(
                requires_kyc=bool(payload.get("requires_kyc", False)),
                multisig=bool(payload.get("multisig", True)),
                notes=str(payload.get("notes", "Meta-Agentic V2 demo auto-registration")),
            ),
            router=None,
            operator_secret=str(payload.get("operator_secret", f"{agent_id}-secret")),
        )
        try:
            registry.register(registration)
            onboarded.append(agent_id)
        except AgentRegistryError as exc:  # pragma: no cover - extremely unlikely in CI
            raise RuntimeError(f"Unable to register demo agent `{agent_id}`: {exc}") from exc
    return onboarded


def _build_attachments(config: MetaAgenticV2Configuration) -> List[Attachment]:
    attachments: List[Attachment] = []
    for resource in config.attachments:
        path = Path(resource)
        attachments.append(Attachment(name=path.name, cid=None, size=None))
    return attachments


def _build_plan(config: MetaAgenticV2Configuration, attachments: Sequence[Attachment]) -> OrchestrationPlan:
    intent = JobIntent(
        kind="custom",
        title=config.scenario.title,
        description=config.scenario.narrative,
        attachments=list(attachments),
    )

    phase_meta: List[Mapping[str, Any]] = []
    steps: List[Step] = []
    for phase in config.phases:
        step_payload: MutableMapping[str, Any] = dict(phase.step_payload)
        step_payload.setdefault("id", phase.identifier)
        step_payload.setdefault("name", phase.label)
        step_payload.setdefault("kind", "plan")
        metadata = {
            "phase": phase.identifier,
            "label": phase.label,
            "weight": phase.weight,
            "success_metric": phase.success_metric,
        }
        phase_meta.append(metadata)
        step = Step.model_validate(step_payload)
        steps.append(step)

    plan = OrchestrationPlan.from_intent(intent, steps=steps, budget_max=str(config.plan.budget.get("max", "0")))
    plan.metadata.update(
        {
            "scenario": {
                "id": config.scenario.identifier,
                "title": config.scenario.title,
                "owner": config.owner,
                "treasury": config.treasury,
                "gasless": config.gasless,
            },
            "phases": phase_meta,
            "approvals": list(config.approvals),
            "confirmations": list(config.confirmations),
            "generatedAt": time.time(),
        }
    )
    if config.plan.antifragility:
        plan.metadata["antifragility"] = dict(config.plan.antifragility)
    return plan


def _phase_scores(config: MetaAgenticV2Configuration, status: Any) -> List[PhaseScore]:
    state_by_id = {step.id: step.state for step in status.steps}
    scores: List[PhaseScore] = []
    for phase in config.phases:
        state = state_by_id.get(phase.identifier, "pending")
        if state == "completed":
            ratio = 1.0
        elif state == "failed":
            ratio = 0.0
        elif state == "running":
            ratio = 0.75
        else:
            ratio = 0.25
        scores.append(
            PhaseScore(
                phase_id=phase.identifier,
                label=phase.label,
                weight=phase.weight,
                success_metric=phase.success_metric,
                state=state,
                completion_ratio=ratio,
            )
        )
    return scores


def _alpha_readiness(scores: Sequence[PhaseScore]) -> float:
    total_weight = sum(score.weight for score in scores) or 1.0
    weighted = sum(score.weight * score.completion_ratio for score in scores)
    readiness = min(0.999, max(0.0, weighted / total_weight))
    return readiness


def _write_summary(
    config: MetaAgenticV2Configuration,
    status: Any,
    plan: OrchestrationPlan,
    phase_scores: Sequence[PhaseScore],
    onboarded_agents: Sequence[str],
) -> Path:
    from orchestrator.scoreboard import get_scoreboard

    alpha_readiness = _alpha_readiness(phase_scores)
    scoreboard_snapshot = get_scoreboard().snapshot()
    payload = {
        "runId": status.run.id,
        "state": status.run.state,
        "alphaReadiness": alpha_readiness,
        "phaseScores": [
            {
                "phase": score.phase_id,
                "label": score.label,
                "state": score.state,
                "weight": score.weight,
                "metric": score.success_metric,
                "completion": score.completion_ratio,
            }
            for score in phase_scores
        ],
        "approvals": list(config.approvals),
        "confirmations": list(config.confirmations),
        "owner": config.owner,
        "treasury": config.treasury,
        "gasless": config.gasless,
        "agents": list(onboarded_agents),
        "scoreboard": scoreboard_snapshot,
        "steps": [step.model_dump(mode="json") for step in plan.steps],
        "logs": status.logs,
    }
    summary_path = config.base_dir / "storage" / "latest_run_v2.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary_path


def run_demo(config: MetaAgenticV2Configuration, *, timeout: float = 120.0) -> MetaAgenticV2Outcome:
    """Execute the Meta-Agentic V2 demo end-to-end."""

    _ensure_environment(config.base_dir)
    attachments = _build_attachments(config)
    onboarded_agents = _register_agents(config)
    plan = _build_plan(config, attachments)

    from orchestrator.runner import start_run

    run_info = start_run(plan, approvals=list(config.approvals))

    from orchestrator.runner import get_status

    deadline = time.time() + timeout
    status = get_status(run_info.id)
    while status.run.state not in {"succeeded", "failed"}:
        if time.time() > deadline:
            raise TimeoutError(f"Run {run_info.id} did not complete within {timeout} seconds")
        time.sleep(0.25)
        status = get_status(run_info.id)

    scores = _phase_scores(config, status)
    summary_path = _write_summary(config, status, plan, scores, onboarded_agents)

    from orchestrator.scoreboard import get_scoreboard

    outcome = MetaAgenticV2Outcome(
        run_id=run_info.id,
        plan=plan,
        status=status,
        summary_path=summary_path,
        phase_scores=tuple(scores),
        scoreboard_snapshot=get_scoreboard().snapshot(),
        metadata={
            "attachments": [attachment.model_dump() for attachment in attachments],
            "onboarded_agents": list(onboarded_agents),
        },
    )
    return outcome


__all__ = [
    "MetaAgenticV2Outcome",
    "PhaseScore",
    "run_demo",
]
