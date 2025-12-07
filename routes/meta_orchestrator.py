"""FastAPI router exposing the planner → simulate → runner endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from prometheus_client import Counter, Histogram

from orchestrator.models import ExecIn, PlanIn, PlanOut, SimIn, SimOut, StatusOut
from orchestrator.planner import make_plan
from orchestrator.runner import get_status, start_run
from orchestrator.simulator import simulate_plan
from .security import SecurityContext, audit_event
from .security import require_security


async def _require_api_dependency(
    request: Request,
    auth: str | None = Header(None, alias="Authorization"),
    signature: str | None = Header(None, alias="X-Signature"),
    timestamp: str | None = Header(None, alias="X-Timestamp"),
    actor: str | None = Header(None, alias="X-Actor"),
):
    """Authenticate meta-orchestrator calls using the shared onebox settings."""

    try:  # pragma: no cover - import guard for test environments
        import routes.onebox as onebox
    except Exception as exc:  # pragma: no cover - fail closed when core router is unavailable
        raise HTTPException(status_code=503, detail="ONEBOX_UNAVAILABLE") from exc

    api_token = getattr(onebox, "_API_TOKEN", "")
    try:  # re-read settings to honor reloads
        from routes import security as security
    except Exception as exc:  # pragma: no cover - fail closed if security module breaks
        raise HTTPException(status_code=503, detail="SECURITY_UNAVAILABLE") from exc

    settings = getattr(security, "_SETTINGS", None)
    security_configured = bool(
        api_token
        or (settings and (settings.tokens or settings.signing_secret or settings.default_token))
    )

    if not security_configured:
        context = onebox._context_from_request(request)  # type: ignore[attr-defined]
        request.state.security_context = context
        return context

    if not auth:
        raise HTTPException(status_code=401, detail="AUTH_MISSING")

    return await require_security(
        request,
        authorization=auth,
        signature=signature,
        timestamp=timestamp,
        actor_header=actor,
        fallback_token=api_token or None,
    )


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/onebox", tags=["meta-orchestrator"], dependencies=[Depends(_require_api_dependency)]
)

_PLAN_LATENCY = Histogram(
    "plan_latency_seconds",
    "Time spent generating orchestration plans.",
)
_SIM_LATENCY = Histogram(
    "simulate_latency_seconds",
    "Time spent simulating orchestration plans.",
)
_EXEC_STEP_LATENCY = Histogram(
    "execute_step_latency_seconds",
    "Observed execution latency per run (includes stub execution).",
)
_RUN_SUCCESS = Counter("run_success_total", "Completed runs.")
_RUN_FAIL = Counter("run_fail_total", "Failed runs.")


def _context_from_request(request: Request) -> SecurityContext:
    context = getattr(request.state, "security_context", None)
    if isinstance(context, SecurityContext):
        return context
    return SecurityContext(actor="anonymous", role="public", token_hash="")


@router.post("/plan", response_model=PlanOut)
def plan(req: PlanIn, request: Request) -> PlanOut:
    with _PLAN_LATENCY.time():
        result = make_plan(req)
    logger.info("meta_orchestrator.plan", extra={"plan_id": result.plan.plan_id})
    audit_event(
        _context_from_request(request),
        "meta.plan",
        plan_id=result.plan.plan_id,
        intent=result.intent.kind,
    )
    return result


@router.post("/simulate", response_model=SimOut)
def simulate(req: SimIn, request: Request) -> SimOut:
    with _SIM_LATENCY.time():
        result = simulate_plan(req.plan)
    logger.info(
        "meta_orchestrator.simulate",
        extra={"plan_id": req.plan.plan_id, "risks": result.risks, "blockers": result.blockers},
    )
    audit_event(
        _context_from_request(request),
        "meta.simulate",
        plan_id=req.plan.plan_id,
        blockers=len(result.blockers),
    )
    if result.blockers:
        raise HTTPException(status_code=422, detail={"code": "BLOCKED", "blockers": result.blockers})
    return result


@router.post("/execute")
def execute(req: ExecIn, request: Request) -> dict:
    run = start_run(req.plan, req.approvals)
    logger.info("meta_orchestrator.execute", extra={"plan_id": run.plan_id, "run_id": run.id})
    audit_event(
        _context_from_request(request),
        "meta.execute",
        plan_id=run.plan_id,
        run_id=run.id,
    )
    _EXEC_STEP_LATENCY.observe(0.0)
    return {"run_id": run.id, "started_at": run.started_at, "plan_id": run.plan_id}


@router.get("/status", response_model=StatusOut)
def status(request: Request, run_id: str = Query(..., alias="run_id")) -> StatusOut:
    try:
        status_obj = get_status(run_id)
    except KeyError as exc:  # pragma: no cover - defensive
        _RUN_FAIL.inc()
        raise HTTPException(status_code=404, detail="RUN_NOT_FOUND") from exc

    if status_obj.run.state == "succeeded":
        _RUN_SUCCESS.inc()
    elif status_obj.run.state == "failed":
        _RUN_FAIL.inc()
    audit_event(
        _context_from_request(request),
        "meta.status",
        run_id=run_id,
        state=status_obj.run.state,
    )
    return status_obj

