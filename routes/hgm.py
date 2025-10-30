"""FastAPI router exposing HGM lineage persistence APIs."""

from __future__ import annotations

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


_LINEAGE_PATTERN = re.compile(
    r"lineage\s*\(\s*runId\s*:\s*\"(?P<run>[^\"]+)\"(?:\s*,\s*root\s*:\s*\"(?P<root>[^\"]+)\")?\s*\)"
)


@router.post("/graphql")
def graphql(payload: Dict[str, Any], repo: HgmRepository = Depends(_repository)) -> Dict[str, Any]:
    """Minimal GraphQL endpoint supporting ``lineage`` queries."""

    query = payload.get("query")
    if not isinstance(query, str):
        raise HTTPException(status_code=400, detail="INVALID_QUERY")
    match = _LINEAGE_PATTERN.search(query)
    if not match:
        raise HTTPException(status_code=400, detail="UNSUPPORTED_QUERY")
    run_id = match.group("run")
    root = match.group("root")
    data = repo.fetch_lineage(run_id, root_key=root)
    return {"data": {"lineage": [node.to_dict() for node in data]}}


__all__ = ["router"]
