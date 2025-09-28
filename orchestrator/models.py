"""Shared pydantic models for the meta-orchestrator service."""

from __future__ import annotations

import hashlib
import time
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, validator


class Attachment(BaseModel):
    """Metadata for files referenced by a plan."""

    name: str
    cid: Optional[str] = None
    size: Optional[int] = Field(default=None, ge=0)


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


class Policies(BaseModel):
    allowTools: List[str] = Field(default_factory=list)
    denyTools: List[str] = Field(default_factory=list)
    requireValidator: bool = True


class OrchestrationPlan(BaseModel):
    plan_id: str
    steps: List[Step]
    budget: Budget
    policies: Policies

    @staticmethod
    def from_intent(intent: JobIntent, steps: List[Step], budget_max: str) -> "OrchestrationPlan":
        """Helper to build a plan with a deterministic identifier."""

        payload = f"{intent.json(sort_keys=True)}:{int(time.time())}".encode()
        plan_id = hashlib.sha256(payload).hexdigest()
        return OrchestrationPlan(
            plan_id=plan_id,
            steps=steps,
            budget=Budget(max=str(budget_max)),
            policies=Policies(),
        )


class PlanIn(BaseModel):
    input_text: str = Field(..., min_length=1)
    attachments: List[Attachment] = Field(default_factory=list)


class PlanOut(BaseModel):
    intent: JobIntent
    plan: OrchestrationPlan
    missing_fields: List[str] = Field(default_factory=list)
    preview_summary: str


class SimIn(BaseModel):
    plan: OrchestrationPlan


class SimOut(BaseModel):
    est_budget: str
    est_fees: str
    est_duration: int
    risks: List[str] = Field(default_factory=list)
    confirmations: List[str] = Field(default_factory=list)
    blockers: List[str] = Field(default_factory=list)


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


@validator("missing_fields", allow_reuse=True)
def _dedupe_missing_fields(cls, values: List[str]) -> List[str]:  # noqa: D401
    seen = set()
    deduped: List[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped

