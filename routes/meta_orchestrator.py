"""FastAPI router exposing the planner → simulate → runner endpoints."""

from __future__ import annotations

import logging
import sys

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from prometheus_client import Counter, Histogram

from orchestrator.models import ExecIn, PlanIn, PlanOut, SimIn, SimOut, StatusOut
from orchestrator.planner import make_plan
from orchestrator.runner import get_status, start_run
from orchestrator.simulator import simulate_plan
from .security import SecurityContext, audit_event
from .security import require_security

try:  # Prefer a stable reference even if other tests purge sys.modules entries
    import routes.onebox as _ONEBOX_MODULE
except Exception:  # pragma: no cover - falls back to dynamic import in the dependency
    _ONEBOX_MODULE = None


async def _require_api_dependency(
    request: Request,
    auth: str | None = Header(None, alias="Authorization"),
    signature: str | None = Header(None, alias="X-Signature"),
    timestamp: str | None = Header(None, alias="X-Timestamp"),
    actor: str | None = Header(None, alias="X-Actor"),
):
    """Authenticate meta-orchestrator calls using the shared onebox settings."""

    # Reuse a stable reference to the onebox module when available so test fixtures
    # that remove the module from ``sys.modules`` do not silently drop monkeypatched
    # API tokens. If a fresh import succeeds, keep that version to capture any
    # updated configuration; otherwise fall back to the cached module.
    target_onebox = sys.modules.get("routes.onebox") or _ONEBOX_MODULE
    if target_onebox is None:
        try:  # pragma: no cover - import guard for test environments
            import routes.onebox as target_onebox  # type: ignore[no-redef]
        except Exception:
            raise HTTPException(status_code=503, detail="ONEBOX_UNAVAILABLE")

    if target_onebox is not None:
        globals()["_ONEBOX_MODULE"] = target_onebox

    onebox = target_onebox

    api_token = getattr(onebox, "_API_TOKEN", "")
    try:  # re-read settings to honor reloads
        from routes import security as security
    except Exception as exc:  # pragma: no cover - fail closed if security module breaks
        raise HTTPException(status_code=503, detail="SECURITY_UNAVAILABLE") from exc

    settings = getattr(security, "_SETTINGS", None)

    logger.info(
        "meta.auth.debug",
        extra={
            "auth_provided": bool(auth),
            "token_configured": bool(getattr(target_onebox, "_API_TOKEN", None)),
            "default_token_configured": bool(getattr(settings, "default_token", None)),
        },
    )

    fallback_token = api_token or (settings.default_token if settings else None)
    fallback_role = settings.default_role if settings else None

    # Always delegate to the shared security helper so dynamically reloaded tokens
    # (including test monkeypatches) are respected even if earlier modules injected
    # a lightweight onebox stub. When no tokens or signing secrets are configured,
    # ``require_security`` returns an anonymous public context.
    return await require_security(
        request,
        authorization=auth,
        signature=signature,
        timestamp=timestamp,
        actor_header=actor,
        fallback_token=fallback_token or None,
        fallback_role=fallback_role,
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

