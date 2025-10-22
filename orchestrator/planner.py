"""Natural language → structured orchestration plan translator."""

from __future__ import annotations

import copy
import re
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Tuple
from uuid import uuid4

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


def _generate_trace_id() -> str:
    """Generate a unique trace identifier for ICS payloads."""

    return str(uuid4())


def _build_job_spec(intent: JobIntent) -> Dict[str, Any]:
    """Construct a minimal job specification payload."""

    spec: Dict[str, Any] = {"description": intent.description or ""}
    if intent.title:
        spec["title"] = intent.title

    attachments = [attachment.model_dump(exclude_none=True) for attachment in intent.attachments]
    if attachments:
        spec["attachments"] = attachments

    return spec


def _build_ics_candidate(intent: JobIntent, missing_fields: List[str]) -> Dict[str, Any] | None:
    """Create a partial ICS payload used for parity checks and clarifications."""

    if intent.kind == "post_job":
        reward = None if "reward_agialpha" in missing_fields else intent.reward_agialpha
        deadline = None if "deadline_days" in missing_fields else intent.deadline_days
        payload: Dict[str, Any] = {
            "intent": "create_job",
            "params": {
                "job": {
                    "rewardAGIA": reward,
                    "deadline": deadline,
                    "spec": _build_job_spec(intent),
                }
            },
        }
        if intent.title:
            payload["params"]["job"]["title"] = intent.title
        return payload

    if intent.kind == "apply":
        return {
            "intent": "apply_job",
            "params": {
                "jobId": intent.job_id,
                "ens": {"subdomain": None},
            },
        }

    if intent.kind == "submit":
        return {
            "intent": "submit_work",
            "params": {
                "jobId": intent.job_id,
                "result": {"payload": None, "uri": None},
                "ens": {"subdomain": None},
            },
        }

    if intent.kind == "finalize":
        return {
            "intent": "finalize",
            "params": {
                "jobId": intent.job_id,
                "success": None,
            },
        }

    return None


def _ics_missing_fields(ics: Dict[str, Any]) -> List[str]:
    intent = ics.get("intent")
    params: Dict[str, Any] = ics.get("params") or {}

    if intent == "create_job":
        job: Dict[str, Any] = params.get("job") or {}
        result: List[str] = []
        if not job.get("title"):
            result.append("a job title")
        if not job.get("rewardAGIA"):
            result.append("a reward amount")
        if not job.get("deadline"):
            result.append("a deadline")
        if not job.get("spec"):
            result.append("a job spec")
        return result

    if intent == "apply_job":
        result: List[str] = []
        if not params.get("jobId"):
            result.append("a jobId")
        ens = params.get("ens") or {}
        if not ens.get("subdomain"):
            result.append("an ENS subdomain")
        return result

    if intent == "submit_work":
        result: List[str] = []
        if not params.get("jobId"):
            result.append("a jobId")
        ens = (params.get("ens") or {})
        if not ens.get("subdomain"):
            result.append("an ENS subdomain")
        result_payload = (params.get("result") or {})
        has_payload = result_payload.get("payload") is not None or result_payload.get("uri")
        if not has_payload:
            result.append("a result payload or URI")
        return result

    if intent == "finalize":
        result: List[str] = []
        if not params.get("jobId"):
            result.append("a jobId")
        if not isinstance(params.get("success"), bool):
            result.append("a validation outcome")
        return result

    if intent in {"validate", "dispute"}:
        job_id = params.get("jobId")
        if not isinstance(job_id, (int, str)) or job_id == "":
            return ["a jobId"]
        return []

    if intent in {"stake", "withdraw"}:
        stake = params.get("stake") or {}
        missing: List[str] = []
        if not stake.get("amountAGIA"):
            missing.append("a stake amount")
        if not stake.get("role"):
            missing.append("a stake role")
        return missing

    return []


def _ics_needs_info(ics: Dict[str, Any]) -> bool:
    return bool(_ics_missing_fields(ics))


def _ask_follow_up(ics: Dict[str, Any]) -> str:
    missing = _ics_missing_fields(ics)
    if not missing:
        return "I need a bit more information."
    if len(missing) == 1:
        return f"I still need {missing[0]} before I can continue."
    return (
        "I still need "
        + ", ".join(missing[:-1])
        + f" and {missing[-1]} before I can continue."
    )


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

    moderation_params = {
        "title": intent.title,
        "description": intent.description,
        "attachments": [attachment.model_dump(exclude_none=True) for attachment in intent.attachments],
    }

    steps: List[Step] = [
        Step(
            id="moderation_gate",
            name="Moderation and plagiarism screening",
            kind="validate",
            tool="safety.moderation",
            params=moderation_params,
        ),
        Step(
            id="pin_spec",
            name="Pin job specification",
            kind="pin",
            tool="ipfs.pin",
            needs=["moderation_gate"],
        ),
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

    trimmed_steps: List[Step] | None = None

    if intent.kind == "finalize":
        trimmed_steps = steps[-1:]
    elif intent.kind == "submit":
        trimmed_steps = steps[3:]

    if trimmed_steps is not None:
        remaining_ids = {step.id for step in trimmed_steps}
        adjusted_steps = []
        for step in trimmed_steps:
            filtered_needs = [need for need in step.needs if need in remaining_ids]
            if filtered_needs != step.needs:
                step = step.model_copy(update={"needs": filtered_needs})
            adjusted_steps.append(step)
        return adjusted_steps

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

    ics_candidate = _build_ics_candidate(intent, missing)
    clarification_prompt = None
    ics_payload: Dict[str, Any] | None = None

    if ics_candidate is not None:
        if _ics_needs_info(ics_candidate):
            clarification_prompt = _ask_follow_up(ics_candidate)
        else:
            decorated = copy.deepcopy(ics_candidate)
            decorated["confirm"] = bool(requires_confirmation)
            decorated["meta"] = {"traceId": _generate_trace_id()}
            ics_payload = decorated

    return PlanOut(
        intent=intent,
        plan=plan,
        ics=ics_payload,
        missing_fields=missing,
        preview_summary=preview_summary,
        warnings=warnings,
        simulation=simulation,
        clarification_prompt=clarification_prompt,
        requiresConfirmation=requires_confirmation,
    )

