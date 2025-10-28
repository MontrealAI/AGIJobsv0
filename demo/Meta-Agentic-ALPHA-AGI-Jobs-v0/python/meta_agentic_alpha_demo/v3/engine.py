"""Execution harness for the Meta-Agentic α-AGI Jobs Demo V3."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Sequence

import shutil
from textwrap import dedent

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

from .configuration import MetaAgenticV3Configuration, MissionProfile


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
    completion: float


@dataclass
class MetaAgenticV3Outcome:
    """Aggregate artefacts emitted by :func:`run_demo`."""

    run_id: str
    plan: OrchestrationPlan
    status: Any
    summary_path: Path
    phase_scores: Sequence[PhaseScore]
    scoreboard_snapshot: Mapping[str, Any]
    dashboard_path: Path | None = None
    report_path: Path | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)


def _ensure_environment(base_dir: Path) -> Dict[str, Path]:
    storage_root = base_dir / "storage" / "orchestrator_v3"
    storage_root.mkdir(parents=True, exist_ok=True)
    (storage_root / "agents").mkdir(parents=True, exist_ok=True)
    (storage_root / "runs").mkdir(parents=True, exist_ok=True)
    (base_dir / "reports").mkdir(parents=True, exist_ok=True)
    (base_dir / "storage" / "ui" / "v3").mkdir(parents=True, exist_ok=True)

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

    paths = {key: Path(str(value)) for key, value in defaults.items()}
    scoreboard_path = paths["ORCHESTRATOR_SCOREBOARD_PATH"]
    scoreboard_path.parent.mkdir(parents=True, exist_ok=True)
    scoreboard_path.touch(exist_ok=True)
    return paths


def _map_capabilities(entries: Iterable[str]) -> List[AgentCapability]:
    capabilities: List[AgentCapability] = []
    for entry in entries:
        capability = _CAPABILITY_MAP.get(entry.lower())
        if capability:
            capabilities.append(capability)
    if not capabilities:
        capabilities.append(AgentCapability.EXECUTION)
    return capabilities


def _register_agents(config: MetaAgenticV3Configuration) -> List[str]:
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
                notes=str(payload.get("notes", "Meta-Agentic V3 demo auto-registration")),
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


def _build_attachments(config: MetaAgenticV3Configuration) -> List[Attachment]:
    attachments: List[Attachment] = []
    for resource in config.attachments:
        path = Path(resource)
        attachments.append(Attachment(name=path.name, cid=None, size=None))
    return attachments


def _build_plan(config: MetaAgenticV3Configuration, attachments: Sequence[Attachment]) -> OrchestrationPlan:
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

    plan = OrchestrationPlan.from_intent(
        intent,
        steps=steps,
        budget_max=str(config.plan.budget.get("max", "0")),
    )
    plan.metadata.update(
        {
            "scenario": {
                "id": config.scenario.identifier,
                "title": config.scenario.title,
                "owner": config.owner,
                "treasury": config.treasury,
                "gasless": config.gasless,
            },
            "mission": {
                "alpha_goal": config.mission.alpha_goal,
                "ica_target": config.mission.ica_score_target,
                "antifragility_focus": config.mission.antifragility_focus,
                "opportunity_domains": list(config.mission.opportunity_domains),
            },
            "unstoppable": config.unstoppable,
            "phases": phase_meta,
            "approvals": list(config.approvals),
            "confirmations": list(config.confirmations),
            "generatedAt": time.time(),
        }
    )
    if config.plan.antifragility:
        plan.metadata["antifragility"] = dict(config.plan.antifragility)
    return plan


def _phase_scores(config: MetaAgenticV3Configuration, status: Any) -> List[PhaseScore]:
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
                completion=ratio,
            )
        )
    return scores


def _alpha_readiness(scores: Sequence[PhaseScore]) -> float:
    total_weight = sum(score.weight for score in scores) or 1.0
    weighted = sum(score.weight * score.completion for score in scores)
    readiness = min(0.999, max(0.0, weighted / total_weight))
    return readiness


def _alpha_compounding_index(scores: Sequence[PhaseScore], mission: MissionProfile) -> float:
    readiness = _alpha_readiness(scores)
    mission_factor = min(1.0, max(0.0, mission.ica_score_target))
    antifragility_bias = 0.05 if "antifragility" in mission.antifragility_focus.lower() else 0.0
    return min(0.999, readiness * 0.7 + mission_factor * 0.25 + antifragility_bias)


def _render_phase_table(phase_scores: Sequence[PhaseScore]) -> str:
    rows = ["| Phase | State | Completion | Weight | Metric |", "|-------|-------|------------|--------|--------|"]
    for score in phase_scores:
        rows.append(
            f"| {score.label} | {score.state.title()} | {score.completion:.0%} | {score.weight:.2f} | {score.success_metric} |"
        )
    return "\n".join(rows)


def _render_mermaid_timeline(phase_scores: Sequence[PhaseScore]) -> str:
    lines = ["gantt", "    dateFormat  X", "    title Meta-Agentic α-AGI Jobs V3 Execution"]
    for index, score in enumerate(phase_scores, start=1):
        status = "done" if score.state == "completed" else "crit" if score.state == "failed" else "active"
        lines.append(f"    section {score.label}")
        lines.append(f"    {score.success_metric} :{status}, {score.phase_id}, {index}, {max(1, int(score.weight))}")
    return "\n".join(lines)


def _render_mermaid_operating_system(config: MetaAgenticV3Configuration) -> str:
    sentinels = config.unstoppable.get("multi_agent_mesh", {}).get("sentinel_agents", [])
    guardian_nodes = "\n            ".join(sentinels) if sentinels else "Guardian"
    return dedent(
        f"""
        graph TD
          Owner --> Planner
          Planner --> Identify
          Planner --> Learn
          Planner --> Think
          Planner --> Design
          Planner --> Strategise
          Planner --> Govern
          Planner --> Execute
          Execute --> Treasury
          Treasury --> Feedback
          Feedback --> Planner
          subgraph GuardianQuorum
            {guardian_nodes}
          end
          Govern --> GuardianQuorum
        """
    ).strip()


def _build_summary_payload(
    config: MetaAgenticV3Configuration,
    status: Any,
    plan: OrchestrationPlan,
    phase_scores: Sequence[PhaseScore],
    onboarded_agents: Sequence[str],
) -> Dict[str, Any]:
    from orchestrator.scoreboard import get_scoreboard

    alpha_readiness = _alpha_readiness(phase_scores)
    alpha_compounding = _alpha_compounding_index(phase_scores, config.mission)
    scoreboard_snapshot = get_scoreboard().snapshot()
    timeline = _render_mermaid_timeline(phase_scores)
    operating_system = _render_mermaid_operating_system(config)

    payload: Dict[str, Any] = {
        "runId": status.run.id,
        "state": status.run.state,
        "alphaReadiness": alpha_readiness,
        "alphaCompoundingIndex": alpha_compounding,
        "phaseScores": [
            {
                "phase": score.phase_id,
                "label": score.label,
                "state": score.state,
                "weight": score.weight,
                "metric": score.success_metric,
                "completion": score.completion,
            }
            for score in phase_scores
        ],
        "approvals": list(config.approvals),
        "confirmations": list(config.confirmations),
        "owner": config.owner,
        "treasury": config.treasury,
        "gasless": config.gasless,
        "mission": {
            "alpha_goal": config.mission.alpha_goal,
            "ica_score_target": config.mission.ica_score_target,
            "antifragility_focus": config.mission.antifragility_focus,
            "opportunity_domains": list(config.mission.opportunity_domains),
        },
        "unstoppable": config.unstoppable,
        "agents": list(onboarded_agents),
        "scoreboard": scoreboard_snapshot,
        "steps": [step.model_dump(mode="json") for step in plan.steps],
        "logs": status.logs,
        "timeline": timeline,
        "operatingSystem": operating_system,
    }
    payload["scenario"] = {
        "id": config.scenario.identifier,
        "title": config.scenario.title,
        "narrative": config.scenario.narrative,
    }
    payload["plan"] = {
        "approvals": list(config.approvals),
        "budget": config.plan.budget,
        "antifragility": config.plan.antifragility,
    }
    return payload


def _write_summary(config: MetaAgenticV3Configuration, payload: Mapping[str, Any]) -> Path:
    summary_path = config.base_dir / "storage" / "latest_run_v3.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary_path


def _sync_console_assets(config: MetaAgenticV3Configuration) -> Path:
    source_dir = config.base_dir / "meta_agentic_alpha_v3" / "ui"
    destination_dir = config.base_dir / "storage" / "ui" / "v3"
    destination_dir.mkdir(parents=True, exist_ok=True)

    for existing in destination_dir.glob("*"):
        if existing.is_file():
            existing.unlink()
        elif existing.is_dir():
            shutil.rmtree(existing)

    for entry in source_dir.glob("**/*"):
        if entry.is_dir():
            continue
        relative = entry.relative_to(source_dir)
        target = destination_dir / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(entry, target)

    return destination_dir / "index.html"


def _write_dashboard_data(config: MetaAgenticV3Configuration, payload: Mapping[str, Any]) -> Path:
    dashboard_path = config.base_dir / "storage" / "ui" / "v3" / "dashboard-data.json"
    dashboard_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return dashboard_path


def _write_meta_report(
    config: MetaAgenticV3Configuration,
    payload: Mapping[str, Any],
    phase_scores: Sequence[PhaseScore],
) -> Path:
    report_dir = config.base_dir / "meta_agentic_alpha_v3" / "reports" / "generated"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "meta_synthesis.md"

    owner = config.owner
    guardians = ", ".join(owner.get("guardians", [])) or "—"
    treasury = config.treasury
    gasless = config.gasless
    phase_table = _render_phase_table(phase_scores)
    mermaid_timeline = payload.get("timeline", "")
    operating_system = payload.get("operatingSystem", "")

    content = dedent(
        f"""
        # Meta-Agentic α-AGI Jobs Demo V3 — Live Mission Synthesis

        ## Governance Posture

        - **Owner:** {owner.get("address", "n/a")}
        - **Guardians:** {guardians}
        - **Approvals Required:** {owner.get("approvals_required", "n/a")}
        - **Emergency Pause:** {"Enabled" if owner.get("emergency_pause") else "Disabled"}
        - **Delegation:** {"Enabled" if owner.get("can_delegate_parameters") else "Disabled"}

        ## Treasury & Antifragility

        - **Token:** {treasury.get("token", "AGIALPHA")}
        - **Initial Balance:** {treasury.get("initial_balance", "n/a")}
        - **Risk Limits:** Max drawdown {treasury.get("risk_limits", {}).get("max_drawdown_percent", "?")}%,
          VaR {treasury.get("risk_limits", {}).get("var_percent", "?")}%,
          Antifragility buffer {treasury.get("risk_limits", {}).get("antifragility_buffer_percent", "?")}%,
          Circuit breaker {treasury.get("risk_limits", {}).get("circuit_breaker_percent", "?")}%
        - **Gasless Bundler:** {gasless.get("bundler", "n/a")}
        - **Paymaster:** {gasless.get("paymaster", "n/a")}

        ## Alpha Readiness

        - **Run ID:** {payload.get("runId")}
        - **State:** {payload.get("state")}
        - **Alpha Readiness Score:** {payload.get("alphaReadiness"):.2%}
        - **Compounding Index:** {payload.get("alphaCompoundingIndex"):.2%}
        - **Participating Agents:** {", ".join(payload.get("agents", [])) or "—"}

        ## Phase Telemetry

        {phase_table}

        ```mermaid
        {mermaid_timeline}
        ```

        ## Operating System View

        ```mermaid
        {operating_system}
        ```

        ## Pending Confirmations

        {os.linesep.join(f"- {confirmation}" for confirmation in payload.get('confirmations', [])) or "- None"}

        ## Execution Steps

        ```json
        {json.dumps(payload.get("steps", []), ensure_ascii=False, indent=2)}
        ```
        """
    ).strip()

    report_path.write_text(content, encoding="utf-8")
    return report_path


def run_demo(config: MetaAgenticV3Configuration, *, timeout: float = 150.0) -> MetaAgenticV3Outcome:
    """Execute the Meta-Agentic V3 demo end-to-end."""

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
    summary_payload = _build_summary_payload(config, status, plan, scores, onboarded_agents)
    dashboard_entry_path = _sync_console_assets(config)
    report_path = _write_meta_report(config, summary_payload, scores)
    summary_payload["links"] = {
        "summary": str((config.base_dir / "storage" / "latest_run_v3.json").relative_to(config.base_dir)),
        "report": str(report_path.relative_to(config.base_dir)),
        "dashboard": str(dashboard_entry_path.relative_to(config.base_dir)),
    }
    summary_payload["__reportPath"] = summary_payload["links"]["report"]
    summary_payload["__dashboardPath"] = summary_payload["links"]["dashboard"]
    summary_payload["__sourceSummaryPath"] = "storage/latest_run_v3.json"
    summary_path = _write_summary(config, summary_payload)
    dashboard_data_path = _write_dashboard_data(config, summary_payload)

    from orchestrator.scoreboard import get_scoreboard

    outcome = MetaAgenticV3Outcome(
        run_id=run_info.id,
        plan=plan,
        status=status,
        summary_path=summary_path,
        phase_scores=tuple(scores),
        scoreboard_snapshot=get_scoreboard().snapshot(),
        dashboard_path=dashboard_entry_path,
        report_path=report_path,
        metadata={
            "attachments": [attachment.model_dump() for attachment in attachments],
            "onboarded_agents": list(onboarded_agents),
            "dashboardDataPath": str(dashboard_data_path),
            "alphaReadiness": summary_payload.get("alphaReadiness"),
            "alphaCompoundingIndex": summary_payload.get("alphaCompoundingIndex"),
        },
    )
    return outcome


__all__ = [
    "MetaAgenticV3Outcome",
    "PhaseScore",
    "run_demo",
]
