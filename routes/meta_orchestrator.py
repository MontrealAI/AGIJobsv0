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
    """Resolve and invoke ``onebox.require_api`` at request time.

    Test suites monkeypatch the ``routes.onebox`` module (for example, to
    adjust the configured API token). Importing ``require_api`` eagerly would
    bind the dependency to the pre-monkeypatched module, causing security
    checks to be silently skipped. By looking up the dependency when FastAPI
    evaluates it we ensure the latest configuration is honoured.
    """

    try:  # pragma: no cover - import guard for test environments
        module = importlib.import_module("routes.onebox")
        onebox = module  # type: ignore
        _onebox_context = module._context_from_request  # type: ignore[attr-defined]
        _require_api = module.require_api  # type: ignore[attr-defined]
        from .security import _SETTINGS  # type: ignore
    except (RuntimeError, ImportError):  # pragma: no cover - fallback when core router not configured
        async def _require_api(*_args, **_kwargs):  # type: ignore
            return None
        _SETTINGS = None  # type: ignore
        _onebox_context = None  # type: ignore
        onebox = None  # type: ignore

    api_token = getattr(onebox, "_API_TOKEN", "") if onebox else ""

    # Allow anonymous access when no tokens or signing secret are configured.
    if _SETTINGS and not _SETTINGS.tokens and not _SETTINGS.signing_secret and not (api_token or _SETTINGS.default_token):
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

