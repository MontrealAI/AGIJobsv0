"""FastAPI router exposing HGM lineage persistence APIs."""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response

from backend.database import get_database
from backend.models.hgm import HgmRepository, seed_demo_run

try:  # pragma: no cover - align auth with Onebox router when available
    from .onebox import require_api  # type: ignore
except (RuntimeError, ImportError):  # pragma: no cover
    def require_api() -> None:  # type: ignore
        return None


router = APIRouter(prefix="/hgm", tags=["hgm"], dependencies=[Depends(require_api)])


def _repository() -> HgmRepository:
    return HgmRepository(get_database())


@router.get("/runs")
def list_runs(repo: HgmRepository = Depends(_repository)) -> List[Dict[str, Any]]:
    """Return all known HGM runs ordered by recency."""

    return [run.to_dict() for run in repo.list_runs()]


@router.get("/runs/{run_id}")
def get_run(run_id: str, repo: HgmRepository = Depends(_repository)) -> Dict[str, Any]:
    run = repo.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="RUN_NOT_FOUND")
    return run.to_dict()


@router.delete("/runs/{run_id}", status_code=204, response_class=Response)
def delete_run(run_id: str, repo: HgmRepository = Depends(_repository)) -> Response:
    repo.delete_run(run_id)
    return Response(status_code=204)


@router.get("/runs/{run_id}/lineage")
def get_lineage(run_id: str, root: Optional[str] = None, repo: HgmRepository = Depends(_repository)) -> List[Dict[str, Any]]:
    """Return the lineage tree for the requested run."""

    nodes = repo.fetch_lineage(run_id, root_key=root)
    if not nodes:
        if repo.get_run(run_id) is None:
            raise HTTPException(status_code=404, detail="RUN_NOT_FOUND")
        return []
    return [node.to_dict() for node in nodes]


@router.post("/runs/demo-seed", status_code=201)
def seed_demo(repo: HgmRepository = Depends(_repository)) -> Dict[str, Any]:
    run = seed_demo_run(repo)
    return run.to_dict()


_LINEAGE_CALL_PATTERN = re.compile(r"\blineage\s*\((?P<args>[^)]*)\)", re.DOTALL)
_LINEAGE_ARG_PATTERN = re.compile(
    r"(?P<key>runId|root)\s*:\s*(?P<value>\"(?:\\\"|[^\"])*\"|\$[A-Za-z_][A-Za-z0-9_]*)"
)


def _parse_argument_value(value: str, variables: Dict[str, Any]) -> Optional[str]:
    if value.startswith("$"):
        var_name = value[1:]
        var_value = variables.get(var_name)
        return var_value if isinstance(var_value, str) else None
    try:
        return json.loads(value)
    except Exception:
        return None


def _extract_lineage_args(payload: Dict[str, Any]) -> tuple[str, Optional[str]]:
    query = payload.get("query")
    if not isinstance(query, str):
        raise HTTPException(status_code=400, detail="INVALID_QUERY")
    match = _LINEAGE_CALL_PATTERN.search(query)
    if not match:
        raise HTTPException(status_code=400, detail="UNSUPPORTED_QUERY")
    args_raw = match.group("args")
    variables = payload.get("variables")
    variables = variables if isinstance(variables, dict) else {}
    parsed: Dict[str, Optional[str]] = {"runId": None, "root": None}
    for arg_match in _LINEAGE_ARG_PATTERN.finditer(args_raw):
        key = arg_match.group("key")
        value = _parse_argument_value(arg_match.group("value"), variables)
        parsed[key] = value
    run_id = parsed.get("runId")
    root = parsed.get("root")
    if not isinstance(run_id, str) or not run_id:
        raise HTTPException(status_code=400, detail="INVALID_QUERY")
    if root is not None and not isinstance(root, str):
        raise HTTPException(status_code=400, detail="INVALID_QUERY")
    return run_id, root


@router.post("/graphql")
def graphql(payload: Dict[str, Any], repo: HgmRepository = Depends(_repository)) -> Dict[str, Any]:
    """Minimal GraphQL endpoint supporting ``lineage`` queries."""

    run_id, root = _extract_lineage_args(payload)
    data = repo.fetch_lineage(run_id, root_key=root)
    return {"data": {"lineage": [node.to_dict() for node in data]}}


__all__ = ["router"]
