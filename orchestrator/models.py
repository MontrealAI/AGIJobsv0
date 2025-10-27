"""Shared Pydantic models for the meta-orchestrator service."""

from __future__ import annotations

import hashlib
import json
import time
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator

from .policies import load_default_policy


class Attachment(BaseModel):
    """Metadata for files referenced by a plan."""

    name: str
    cid: Optional[str] = None
    size: Optional[int] = Field(default=None, ge=0)


class AgentCapability(str, Enum):
    """Enumerated capabilities an agent can advertise."""

    ROUTER = "router"
    EXECUTION = "execution"
    VALIDATION = "validation"
    ANALYSIS = "analysis"
    SUPPORT = "support"


class AgentStake(BaseModel):
    """Stake profile attached to an agent registration."""

    token: str = Field(default="AGIALPHA", min_length=1)
    amount: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    slashable: bool = True
    lock_expires_at: Optional[float] = Field(default=None, ge=0)
    guardian: Optional[str] = Field(default=None, description="On-chain authority overseeing stake security.")


class AgentSecurityControls(BaseModel):
    """Operational safeguards declared by an agent operator."""

    requires_kyc: bool = False
    multisig: bool = False
    isolation_level: Literal["none", "process", "vm", "hardware"] = "process"
    hardware_root_of_trust: bool = False
    compliance: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class AgentRegistrationIn(BaseModel):
    """Payload used when onboarding a new agent node."""

    agent_id: str = Field(..., pattern=r"^[a-zA-Z0-9._:-]{3,64}$")
    owner: str = Field(..., min_length=2)
    region: str = Field(..., min_length=2)
    capabilities: List[AgentCapability] = Field(..., min_length=1)
    stake: AgentStake
    security: AgentSecurityControls
    router: Optional[str] = Field(default=None, description="Preferred router binding for this agent.")
    operator_secret: str = Field(
        ..., min_length=8, description="Shared secret used by the node to authenticate heartbeats."
    )


class AgentUpdateIn(BaseModel):
    """Partial update payload for an existing agent."""

    region: Optional[str] = Field(default=None, min_length=2)
    capabilities: Optional[List[AgentCapability]] = Field(default=None, min_length=1)
    stake: Optional[AgentStake] = None
    security: Optional[AgentSecurityControls] = None
    router: Optional[str] = Field(default=None)
    status: Optional[Literal["active", "inactive", "suspended", "offline"]] = None
    operator_secret: Optional[str] = Field(
        default=None, min_length=8, description="Rotate the shared secret used for heartbeats."
    )


class AgentHeartbeatIn(BaseModel):
    """Heartbeat payload submitted by running agent nodes."""

    router: Optional[str] = Field(default=None)
    capabilities: Optional[List[AgentCapability]] = None
    secret: Optional[str] = Field(default=None, min_length=8)


class AgentStatus(BaseModel):
    """Live registry entry summarising an onboarded agent."""

    agent_id: str
    owner: str
    region: str
    capabilities: List[AgentCapability] = Field(default_factory=list)
    stake: AgentStake
    security: AgentSecurityControls
    router: Optional[str] = None
    status: Literal["active", "inactive", "suspended", "offline"] = "inactive"
    registered_at: float
    updated_at: float
    last_heartbeat: Optional[float] = None
    heartbeat_lag_seconds: Optional[float] = Field(default=None, ge=0)


class AgentListOut(BaseModel):
    """Response wrapper for listing registered agents."""

    agents: List[AgentStatus] = Field(default_factory=list)
    total: int = 0


class JobIntent(BaseModel):
    """Structured representation of the planner's understanding of the request."""

    kind: Literal["post_job", "apply", "submit", "finalize", "custom"]
    title: Optional[str] = None
    description: Optional[str] = None
    reward_agialpha: Optional[str] = None
    deadline_days: Optional[int] = Field(default=None, ge=0)
    job_id: Optional[int] = None
    attachments: List[Attachment] = Field(default_factory=list)
    constraints: Dict[str, Any] = Field(default_factory=dict)


class StepOutput(BaseModel):
    cid: Optional[str] = None
    tx: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class Step(BaseModel):
    """Individual node inside the orchestration DAG."""

    id: str
    name: str
    kind: Literal[
        "plan",
        "pin",
        "chain",
        "llm",
        "code",
        "fetch",
        "validate",
        "finalize",
    ]
    tool: Optional[str] = None
    params: Dict[str, Any] = Field(default_factory=dict)
    needs: List[str] = Field(default_factory=list)
    out: Optional[StepOutput] = None


class Budget(BaseModel):
    token: Literal["AGIALPHA"] = "AGIALPHA"
    max: str = "0"
    cap: Optional[str] = None


class Policies(BaseModel):
    model_config = ConfigDict(extra="allow")

    allowTools: List[str] = Field(default_factory=list)
    denyTools: List[str] = Field(default_factory=list)
    requireValidator: bool = True
    orgId: Optional[str] = None
    organizationId: Optional[str] = None
    tenantId: Optional[str] = None
    teamId: Optional[str] = None
    userId: Optional[str] = None


class OrchestrationPlan(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    plan_id: str
    steps: List[Step]
    budget: Budget
    policies: Policies
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @staticmethod
    def from_intent(intent: JobIntent, steps: List[Step], budget_max: str) -> "OrchestrationPlan":
        """Helper to build a plan with a deterministic identifier."""

        intent_payload = intent.model_dump(mode="json", exclude_none=True, by_alias=True)
        payload = f"{json.dumps(intent_payload, sort_keys=True)}:{int(time.time())}".encode()
        plan_id = hashlib.sha256(payload).hexdigest()

        policy_payload = load_default_policy()
        policy_allow = policy_payload.get("allowTools", []) or []
        policy_deny = policy_payload.get("denyTools", []) or []
        require_validator = bool(policy_payload.get("requireValidator", True))
        policy_budget = policy_payload.get("budget", {}) or {}
        budget_token = policy_budget.get("token", "AGIALPHA")
        policy_cap = policy_budget.get("dailyMax")
        budget_max = budget_max or policy_cap or "0"

        return OrchestrationPlan(
            plan_id=plan_id,
            steps=steps,
            budget=Budget(
                token=budget_token,
                max=str(budget_max),
                cap=str(policy_cap) if policy_cap is not None else None,
            ),
            policies=Policies(
                allowTools=list(policy_allow),
                denyTools=list(policy_deny),
                requireValidator=require_validator,
            ),
        )


class PlanIn(BaseModel):
    input_text: str = Field(..., min_length=1)
    attachments: List[Attachment] = Field(default_factory=list)


class PlanOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    intent: JobIntent
    plan: OrchestrationPlan
    ics: Dict[str, Any] | None = None
    missing_fields: List[str] = Field(default_factory=list)
    preview_summary: str
    warnings: List[str] = Field(default_factory=list)
    simulation: "SimOut | None" = None
    clarification_prompt: str | None = Field(
        default=None,
        alias="clarificationPrompt",
        serialization_alias="clarificationPrompt",
    )
    requires_confirmation: bool = Field(
        default=True,
        alias="requiresConfirmation",
        serialization_alias="requiresConfirmation",
    )

    @field_validator("missing_fields")
    @classmethod
    def _dedupe_missing_fields(cls, values: List[str]) -> List[str]:  # noqa: D401
        seen = set()
        deduped: List[str] = []
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            deduped.append(value)
        return deduped


class SimIn(BaseModel):
    plan: OrchestrationPlan


class SimOut(BaseModel):
    est_budget: str
    est_fees: str
    est_duration: int
    risks: List[str] = Field(default_factory=list)
    confirmations: List[str] = Field(default_factory=list)
    blockers: List[str] = Field(default_factory=list)
    chain_calls: List[Dict[str, Any]] = Field(default_factory=list)
    total_gas_estimate: Optional[str] = None
    total_fee_wei: Optional[str] = None
    fee_breakdown: Dict[str, str] = Field(default_factory=dict)
    risk_details: List[Dict[str, str]] = Field(default_factory=list)
    policy: Dict[str, Any] = Field(default_factory=dict)


class ExecIn(BaseModel):
    plan: OrchestrationPlan
    approvals: List[str] = Field(default_factory=list)


class StepStatus(BaseModel):
    id: str
    name: str
    kind: str
    state: Literal["pending", "running", "completed", "failed"]
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    message: Optional[str] = None


class RunInfo(BaseModel):
    id: str
    plan_id: str
    state: Literal["pending", "running", "succeeded", "failed"]
    created_at: float
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    est_budget: Optional[str] = None


class Receipt(BaseModel):
    plan_id: str
    job_id: Optional[int] = None
    txes: List[str] = Field(default_factory=list)
    cids: List[str] = Field(default_factory=list)
    payouts: List[Dict[str, Any]] = Field(default_factory=list)
    timings: Dict[str, Any] = Field(default_factory=dict)


class StatusOut(BaseModel):
    run: RunInfo
    steps: List[StepStatus]
    current: Optional[str] = None
    logs: List[str] = Field(default_factory=list)
    receipts: Optional[Receipt] = None

