"""Natural language → structured orchestration plan translator."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import List, Tuple

from fastapi import HTTPException, status

from .models import Attachment, JobIntent, OrchestrationPlan, PlanIn, PlanOut, Step


_REWARD_PATTERN = re.compile(r"(?P<amount>\d+(?:\.\d+)?)\s*(?:agi|agialpha)", re.IGNORECASE)
_DEADLINE_PATTERN = re.compile(r"(?P<days>\d+)\s*(?:day|days)", re.IGNORECASE)
_TITLE_PATTERN = re.compile(r"^(?P<title>[^.!?]{3,80})")


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
    return steps


def make_plan(req: PlanIn) -> PlanOut:
    """Convert unstructured input into an orchestration plan."""

    text = req.input_text.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="INPUT_TEXT_REQUIRED")

    attachments = list(req.attachments)
    reward, missing_reward = _infer_reward(text)
    deadline, missing_deadline = _infer_deadline(text)
    missing = [*missing_reward, *missing_deadline]
    title = _infer_title(text)

    intent = JobIntent(
        kind="post_job",
        title=title,
        description=text,
        reward_agialpha=reward,
        deadline_days=deadline,
        attachments=attachments,
    )

    plan = OrchestrationPlan.from_intent(intent, _build_steps(intent), reward or "0")
    summary_parts = [f"Post job '{intent.title}'"]
    if intent.reward_agialpha:
        try:
            reward_amount = Decimal(intent.reward_agialpha)
        except InvalidOperation:
            reward_amount = Decimal("0")
        if reward_amount > 0:
            summary_parts.append(f"escrowing {intent.reward_agialpha} AGIALPHA")
    if intent.deadline_days:
        summary_parts.append(f"running for {intent.deadline_days} day(s)")
    preview_summary = ", ".join(summary_parts) + "."

    return PlanOut(
        intent=intent,
        plan=plan,
        missing_fields=missing,
        preview_summary=preview_summary,
    )

