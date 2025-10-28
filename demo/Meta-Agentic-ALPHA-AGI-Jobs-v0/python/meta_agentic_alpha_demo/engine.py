"""Execution harness for the Meta-Agentic α-AGI Jobs demo."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, List

import yaml

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


@dataclass
class DemoConfiguration:
    """Structured view over the YAML configuration."""

    path: Path
    payload: Dict[str, Any]

    @property
    def base_dir(self) -> Path:
        return self.path.parent.parent

    @property
    def demo(self) -> Dict[str, Any]:
        return self.payload.get("demo", {})

    @property
    def plan(self) -> Dict[str, Any]:
        return self.payload.get("plan", {})

    @property
    def plan_steps(self) -> List[Dict[str, Any]]:
        return list(self.plan.get("steps", []))

    @property
    def approvals(self) -> List[str]:
        return list(self.plan.get("approvals", []))

    @property
    def budget_max(self) -> str:
        return str(self.plan.get("budget_max", "0"))


@dataclass
class DemoOutcome:
    """Result artefacts emitted by :func:`run_demo`."""

    run_id: str
    plan: OrchestrationPlan
    status: Any
    summary_path: Path
    report_path: Path | None = None
    scoreboard_snapshot: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


def load_configuration(path: str | Path) -> DemoConfiguration:
    """Load the YAML configuration for the demo."""

    config_path = Path(path).resolve()
    payload = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Configuration payload must be a mapping")
    return DemoConfiguration(path=config_path, payload=payload)


def _ensure_directories(base_dir: Path) -> Dict[str, Path]:
    storage_root = base_dir / "storage" / "orchestrator"
    storage_root.mkdir(parents=True, exist_ok=True)
    (storage_root / "agents").mkdir(parents=True, exist_ok=True)
    (storage_root / "runs").mkdir(parents=True, exist_ok=True)
    (base_dir / "reports").mkdir(parents=True, exist_ok=True)

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


def _hydrate_attachments(config: DemoConfiguration) -> List[Attachment]:
    attachments: List[Attachment] = []
    dashboards = config.demo.get("dashboards", [])
    for entry in dashboards:
        if not isinstance(entry, dict):
            continue
        file_path = entry.get("file")
        if not file_path:
            continue
        attachments.append(
            Attachment(
                name=Path(file_path).name,
                cid=None,
                size=None,
            )
        )
    return attachments


def _register_agents(config: DemoConfiguration) -> List[str]:
    registry = get_registry()
    existing = {agent.agent_id for agent in registry.list().agents}
    onboarded: List[str] = []
    agents = config.demo.get("agents", [])
    for agent in agents:
        if not isinstance(agent, dict):
            continue
        agent_id = str(agent.get("agent_id"))
        if not agent_id:
            continue
        if agent_id in existing:
            onboarded.append(agent_id)
            continue
        capabilities = [
            AgentCapability(capacity)
            for capacity in agent.get("capabilities", [])
            if isinstance(capacity, str)
        ]
        if not capabilities:
            capabilities = [AgentCapability.EXECUTION]
        stake_amount = Decimal(str(agent.get("stake_amount", "0")))
        registration = AgentRegistrationIn(
            agent_id=agent_id,
            owner=str(agent.get("owner", "Demo Owner")),
            region=str(agent.get("region", "global")),
            capabilities=capabilities,
            stake=AgentStake(amount=stake_amount, slashable=bool(agent.get("slashable", True))),
            security=AgentSecurityControls(
                requires_kyc=False,
                multisig=bool(agent.get("multisig", True)),
                notes="Demo agent auto-registered for Meta-Agentic demo",
            ),
            router=None,
            operator_secret=str(agent.get("operator_secret", f"{agent_id}-secret-001")),
        )
        try:
            registry.register(registration)
            onboarded.append(agent_id)
        except AgentRegistryError as exc:
            raise RuntimeError(f"Unable to register demo agent `{agent_id}`: {exc}") from exc
    return onboarded


def _build_plan(config: DemoConfiguration, attachments: Iterable[Attachment]) -> OrchestrationPlan:
    intent = JobIntent(
        kind="custom",
        title=config.demo.get("name") or "Meta-Agentic α-AGI Jobs Demo",
        description=config.demo.get("narrative"),
        attachments=list(attachments),
    )
    steps = [Step.model_validate(step) for step in config.plan_steps]
    plan = OrchestrationPlan.from_intent(intent, steps=steps, budget_max=config.budget_max)
    plan.metadata.update(
        {
            "demo": config.demo,
            "generatedAt": time.time(),
            "scenario": config.path.name,
        }
    )
    return plan


def _await_completion(run_id: str, timeout: float = 30.0, poll: float = 0.2) -> Any:
    from orchestrator.runner import get_status

    deadline = time.time() + timeout
    status = get_status(run_id)
    while status.run.state not in {"succeeded", "failed"}:
        if time.time() > deadline:
            raise TimeoutError(f"Run {run_id} did not complete within {timeout} seconds")
        time.sleep(poll)
        status = get_status(run_id)
    return status


def _write_summary(
    base_dir: Path,
    status: Any,
    plan: OrchestrationPlan,
    onboarded_agents: List[str],
) -> Path:
    from orchestrator.scoreboard import get_scoreboard

    success_steps = sum(1 for step in status.steps if step.state == "completed")
    total_steps = len(status.steps) or 1
    alpha_probability = min(0.999, max(0.0, success_steps / total_steps * 0.98 + 0.02))
    scoreboard_snapshot = get_scoreboard().snapshot()
    summary_payload = {
        "runId": status.run.id,
        "state": status.run.state,
        "completedSteps": success_steps,
        "totalSteps": total_steps,
        "estimatedAlphaProbability": alpha_probability,
        "governance": plan.metadata.get("demo", {}).get("owner", {}),
        "agents": onboarded_agents,
        "scoreboard": scoreboard_snapshot,
        "logs": status.logs,
        "steps": [step.model_dump() for step in plan.steps],
    }
    summary_path = base_dir / "storage" / "latest_run.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary_path


def run_demo(config: DemoConfiguration, *, timeout: float = 60.0) -> DemoOutcome:
    """Execute the configured Meta-Agentic demo end-to-end."""

    _ensure_directories(config.base_dir)
    attachments = _hydrate_attachments(config)
    onboarded_agents = _register_agents(config)
    plan = _build_plan(config, attachments)

    from orchestrator.runner import get_status, start_run
    from orchestrator.scoreboard import get_scoreboard

    run_info = start_run(plan, approvals=config.approvals)
    status = _await_completion(run_info.id, timeout=timeout)
    summary_path = _write_summary(config.base_dir, status, plan, onboarded_agents)

    outcome = DemoOutcome(
        run_id=run_info.id,
        plan=plan,
        status=status,
        summary_path=summary_path,
        scoreboard_snapshot=get_scoreboard().snapshot(),
        metadata={
            "attachments": [attachment.model_dump() for attachment in attachments],
            "onboarded_agents": onboarded_agents,
        },
    )
    return outcome


__all__ = [
    "DemoConfiguration",
    "DemoOutcome",
    "load_configuration",
    "run_demo",
]
