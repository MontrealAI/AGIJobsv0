"""FastAPI router exposing the planner → simulate → runner endpoints."""

from __future__ import annotations

import logging

import importlib
import sys

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from prometheus_client import Counter, Histogram

from orchestrator.models import ExecIn, PlanIn, PlanOut, SimIn, SimOut, StatusOut
from orchestrator.planner import make_plan
from orchestrator.runner import get_status, start_run
from orchestrator.simulator import simulate_plan
from .security import SecurityContext, audit_event

async def _require_api_dependency(
    request: Request,
    auth: str | None = Header(None, alias="Authorization"),
    signature: str | None = Header(None, alias="X-Signature"),
    timestamp: str | None = Header(None, alias="X-Timestamp"),
    actor: str | None = Header(None, alias="X-Actor"),
):
    """Resolve and invoke ``onebox.require_api`` at request time."""

    try:  # pragma: no cover - import guard for test environments
        module = importlib.import_module("routes.onebox")
        # Reload lightweight stubs injected by other test modules so that
        # security checks always execute against the real implementation.
        if getattr(module, "__spec__", None) is None:
            sys.modules.pop("routes.onebox", None)
            module = importlib.import_module("routes.onebox")
        elif not hasattr(module, "require_api") or not hasattr(module, "_context_from_request"):
            module = importlib.reload(module)

        onebox = module  # type: ignore
        _onebox_context = module._context_from_request  # type: ignore[attr-defined]
        _require_api = module.require_api  # type: ignore[attr-defined]
        from .security import _SETTINGS  # type: ignore
    except (RuntimeError, ImportError) as exc:  # pragma: no cover - fail closed when core router is unavailable
        raise HTTPException(status_code=503, detail="ONEBOX_UNAVAILABLE") from exc

    api_token = getattr(onebox, "_API_TOKEN", "") if onebox else ""
    security_configured = bool(
        api_token
        or (_SETTINGS and (_SETTINGS.tokens or _SETTINGS.signing_secret or _SETTINGS.default_token))
    )

    if security_configured and not auth:
        # Require an explicit bearer token whenever security is configured. This mirrors
        # ``onebox.require_api`` and prevents earlier anonymous calls from caching a
        # permissive security context for later requests in the same app instance.
        raise HTTPException(status_code=401, detail="AUTH_MISSING")

    # Allow anonymous access only when no security configuration is present at all.
    if _SETTINGS and not security_configured:
        context = _onebox_context(request) if _onebox_context else None  # type: ignore[arg-type]
        if context is not None:
            request.state.security_context = context
        return context

    return await _require_api(request, auth, signature, timestamp, actor)


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

