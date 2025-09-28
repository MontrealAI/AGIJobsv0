"""Natural language → structured orchestration plan translator."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import List, Tuple

from fastapi import HTTPException, status

from .config import format_percent, get_burn_fraction, get_fee_fraction
from .models import Attachment, JobIntent, OrchestrationPlan, PlanIn, PlanOut, Step
from .simulator import simulate_plan


_REWARD_PATTERN = re.compile(r"(?P<amount>-?\d+(?:\.\d+)?)\s*(?:agi|agialpha)", re.IGNORECASE)
_DEADLINE_PATTERN = re.compile(r"(?P<days>\d+)\s*(?:day|days)", re.IGNORECASE)
_TITLE_PATTERN = re.compile(r"^(?P<title>[^.!?]{3,80})")
_JOB_ID_PATTERN = re.compile(r"job\s*(?:#|id\s*)?(?P<job_id>\d+)", re.IGNORECASE)

_REQUIRED_FIELDS_BY_INTENT = {
    "apply": {"job_id"},
    "submit": {"job_id"},
    "finalize": {"job_id"},
}

DEFAULT_REWARD = Decimal("50")
DEFAULT_DEADLINE_DAYS = 7
FEE_FRACTION = get_fee_fraction()
BURN_FRACTION = get_burn_fraction()
FEE_PERCENT_LABEL = format_percent(FEE_FRACTION)
BURN_PERCENT_LABEL = format_percent(BURN_FRACTION)


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
    reward_raw, _missing_reward = _infer_reward(text)
    deadline_raw, _missing_deadline = _infer_deadline(text)
    reward = reward_raw
    deadline = deadline_raw
    job_id = _infer_job_id(text) if intent_kind != "post_job" else None

    warnings: List[str] = []
    missing: List[str] = []
    defaults_applied = False

    if _missing_reward:
        for field in _missing_reward:
            if field not in missing:
                missing.append(field)
    if _missing_deadline:
        for field in _missing_deadline:
            if field not in missing:
                missing.append(field)

    reward_decimal = Decimal("0")

    if intent_kind == "post_job":
        if reward is None:
            reward_decimal = DEFAULT_REWARD.quantize(Decimal("0.01"))
            reward = format(reward_decimal, "f")
            warnings.append("DEFAULT_REWARD_APPLIED")
            if "reward_agialpha" not in missing:
                missing.append("reward_agialpha")
            defaults_applied = True
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
            if "deadline_days" not in missing:
                missing.append("deadline_days")
            defaults_applied = True
        elif deadline <= 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="DEADLINE_INVALID")
    required_fields = _REQUIRED_FIELDS_BY_INTENT.get(intent_kind, set())

    if "job_id" in required_fields and job_id is None:
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
    if intent_kind == "post_job":
        total_budget = (
            reward_decimal * (Decimal("1") + FEE_FRACTION + BURN_FRACTION)
        ).quantize(Decimal("0.01"))

    plan = OrchestrationPlan.from_intent(
        intent,
        _build_steps(intent),
        format(total_budget, "f"),
    )

    blockers: List[str] = []

    simulation = None
    if intent.kind == "post_job":
        simulation = simulate_plan(plan)
        warnings.extend(simulation.risks)
        warnings.extend(simulation.blockers)
        if simulation.blockers:
            blockers.extend(simulation.blockers)

    summary_parts = []
    if intent.kind == "post_job":
        summary_parts.append(f"Post job '{intent.title}'")
        if reward is None:
            summary_parts.append("escrowing ??? AGIALPHA")
        elif intent_kind == "post_job" and "DEFAULT_REWARD_APPLIED" in warnings:
            summary_parts.append(f"escrowing {reward} AGIALPHA (default)")
        else:
            summary_parts.append(f"escrowing {reward} AGIALPHA")

        if deadline is None:
            summary_parts.append("duration ??? day(s)")
        elif intent_kind == "post_job" and "DEFAULT_DEADLINE_APPLIED" in warnings:
            summary_parts.append(f"duration {intent.deadline_days} day(s) (default)")
        else:
            summary_parts.append(f"duration {intent.deadline_days} day(s)")
        summary_parts.append(
            (
                f"total escrow {format(total_budget, 'f')} AGIALPHA "
                f"(fee {FEE_PERCENT_LABEL}, burn {BURN_PERCENT_LABEL})"
            )
        )
    elif intent.kind == "apply":
        summary_parts.append(f"Apply to job {intent.job_id or '???'}")
    elif intent.kind == "submit":
        summary_parts.append(f"Submit deliverable for job {intent.job_id or '???'}")
    elif intent.kind == "finalize":
        summary_parts.append(f"Finalize payout for job {intent.job_id or '???'}")
    else:
        summary_parts.append("Custom workflow ready")
    preview_summary = ", ".join(summary_parts) + ". Proceed?"

    requires_confirmation = not missing and not blockers and not defaults_applied

    return PlanOut(
        intent=intent,
        plan=plan,
        missing_fields=missing,
        preview_summary=preview_summary,
        warnings=warnings,
        simulation=simulation,
        requiresConfirmation=requires_confirmation,
    )

