"""Natural language → structured orchestration plan translator."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import List, Tuple

from fastapi import HTTPException, status

from .models import Attachment, JobIntent, OrchestrationPlan, PlanIn, PlanOut, Step


_REWARD_PATTERN = re.compile(r"(?P<amount>-?\d+(?:\.\d+)?)\s*(?:agi|agialpha)", re.IGNORECASE)
_DEADLINE_PATTERN = re.compile(r"(?P<days>\d+)\s*(?:day|days)", re.IGNORECASE)
_TITLE_PATTERN = re.compile(r"^(?P<title>[^.!?]{3,80})")
_JOB_ID_PATTERN = re.compile(r"job\s*(?:#|id\s*)?(?P<job_id>\d+)", re.IGNORECASE)

DEFAULT_REWARD = Decimal("50")
DEFAULT_DEADLINE_DAYS = 7
FEE_PCT = Decimal("0.05")
BURN_PCT = Decimal("0.02")


def _infer_reward(text: str) -> Tuple[str | None, List[str]]:
    match = _REWARD_PATTERN.search(text)
    if not match:
        return None, ["reward_agialpha"]
    try:
        reward = Decimal(match.group("amount")).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None, ["reward_agialpha"]
    return format(reward, "f"), []


def _infer_deadline(text: str) -> Tuple[int | None, List[str]]:
    match = _DEADLINE_PATTERN.search(text)
    if not match:
        return None, ["deadline_days"]
    try:
        days = int(match.group("days"))
    except (TypeError, ValueError):
        return None, ["deadline_days"]
    return days, []


def _infer_title(text: str) -> str:
    match = _TITLE_PATTERN.search(text.strip())
    if not match:
        return text.strip()[:80] or "Untitled job"
    return match.group("title").strip().capitalize()


def _infer_job_id(text: str) -> int | None:
    match = _JOB_ID_PATTERN.search(text)
    if not match:
        return None
    try:
        return int(match.group("job_id"))
    except (TypeError, ValueError):
        return None


def _detect_intent_kind(text: str) -> str:
    lowered = text.lower()
    if any(keyword in lowered for keyword in ("finalize", "payout", "close job")):
        return "finalize"
    if any(keyword in lowered for keyword in ("submit", "deliver", "turn in")):
        return "submit"
    if any(keyword in lowered for keyword in ("apply", "claim", "work on")):
        return "apply"
    return "post_job"


def _build_steps(intent: JobIntent) -> List[Step]:
    """Create a minimal DAG for the provided intent."""

    steps: List[Step] = [
        Step(id="pin_spec", name="Pin job specification", kind="pin", tool="ipfs.pin"),
        Step(
            id="post_job",
            name="Post job on-chain",
            kind="chain",
            tool="job.post",
            needs=["pin_spec"],
        ),
        Step(
            id="collect_submissions",
            name="Collect submissions",
            kind="fetch",
            needs=["post_job"],
        ),
        Step(
            id="validator_review",
            name="Validator quorum",
            kind="validate",
            tool="validator.quorum",
            params={"quorum": 3},
            needs=["collect_submissions"],
        ),
        Step(
            id="finalize_payout",
            name="Finalize and payout",
            kind="finalize",
            tool="job.finalize",
            needs=["validator_review"],
        ),
    ]

    if intent.kind == "finalize":
        return steps[-1:]
    if intent.kind == "submit":
        return steps[2:]
    if intent.kind == "apply":
        return [
            Step(
                id="apply_job",
                name="Submit agent application",
                kind="chain",
                tool="job.apply",
            )
        ]
    return steps


def make_plan(req: PlanIn) -> PlanOut:
    """Convert unstructured input into an orchestration plan."""

    text = req.input_text.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="INPUT_TEXT_REQUIRED")

    attachments = list(req.attachments)
    intent_kind = _detect_intent_kind(text)
    reward_raw, missing_reward = _infer_reward(text)
    deadline_raw, missing_deadline = _infer_deadline(text)
    reward = reward_raw
    deadline = deadline_raw
    job_id = _infer_job_id(text) if intent_kind != "post_job" else None

    warnings: List[str] = []
    missing: List[str] = []

    reward_decimal = Decimal("0")

    if intent_kind == "post_job":
        if reward is None:
            reward_decimal = DEFAULT_REWARD.quantize(Decimal("0.01"))
            reward = format(reward_decimal, "f")
            warnings.append("DEFAULT_REWARD_APPLIED")
        else:
            try:
                reward_decimal = Decimal(reward)
                if reward_decimal <= 0:
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="INVALID_REWARD")
                reward_decimal = reward_decimal.quantize(Decimal("0.01"))
                reward = format(reward_decimal, "f")
            except InvalidOperation as exc:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="INVALID_REWARD") from exc

        if deadline is None:
            deadline = DEFAULT_DEADLINE_DAYS
            warnings.append("DEFAULT_DEADLINE_APPLIED")
        elif deadline <= 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="DEADLINE_INVALID")
    elif intent_kind == "apply":
        missing.extend(field for field in missing_reward if field not in missing)
        missing.extend(field for field in missing_deadline if field not in missing)

    if intent_kind in {"apply", "submit", "finalize"} and job_id is None:
        missing.append("job_id")

    title = _infer_title(text)

    intent = JobIntent(
        kind=intent_kind,  # type: ignore[arg-type]
        title=title,
        description=text,
        reward_agialpha=reward,
        deadline_days=deadline,
        job_id=job_id,
        attachments=attachments,
    )

    if reward and intent_kind != "post_job":
        try:
            reward_decimal = Decimal(reward).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError):
            reward_decimal = Decimal("0")

    total_budget = reward_decimal
    budget_value = reward_decimal
    if intent_kind == "post_job":
        total_budget = (reward_decimal * (Decimal("1") + FEE_PCT + BURN_PCT)).quantize(Decimal("0.01"))
        budget_value = reward_decimal

    plan = OrchestrationPlan.from_intent(intent, _build_steps(intent), format(budget_value, "f"))

    summary_parts = []
    if intent.kind == "post_job":
        summary_parts.append(f"Post job '{intent.title}'")
        summary_parts.append(f"escrowing {reward} AGIALPHA")
        summary_parts.append(f"duration {intent.deadline_days} day(s)")
        summary_parts.append(f"total escrow {format(total_budget, 'f')} AGIALPHA (fee 5%, burn 2%)")
    elif intent.kind == "apply":
        summary_parts.append(f"Apply to job {intent.job_id or '???'}")
    elif intent.kind == "submit":
        summary_parts.append(f"Submit deliverable for job {intent.job_id or '???'}")
    elif intent.kind == "finalize":
        summary_parts.append(f"Finalize payout for job {intent.job_id or '???'}")
    else:
        summary_parts.append("Custom workflow ready")
    preview_summary = ", ".join(summary_parts) + ". Proceed?"

    return PlanOut(
        intent=intent,
        plan=plan,
        missing_fields=missing,
        preview_summary=preview_summary,
        warnings=warnings,
        requiresConfirmation=True,
    )

