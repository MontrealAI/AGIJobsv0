"""FastAPI router exposing analytics metrics and exports."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from orchestrator.analytics import AnalyticsError, get_cache, run_once

try:  # pragma: no cover - align auth with the Onebox router when available
    from .onebox import require_api  # type: ignore
except (RuntimeError, ImportError):  # pragma: no cover - fallback when router missing
    def require_api() -> None:  # type: ignore
        return None


router = APIRouter(prefix="/analytics", tags=["analytics"], dependencies=[Depends(require_api)])
_CACHE = get_cache()
_OUTPUT_DIR = Path(os.environ.get("ANALYTICS_OUTPUT_DIR", "storage/analytics")).resolve()
_LAST_REFRESH_OK = True


@router.get("/latest")
def get_latest(refresh: bool = False) -> dict[str, object | None]:
    """Return the cached analytics payload, optionally recomputing."""

    global _LAST_REFRESH_OK
    if refresh or not _CACHE.snapshot().get("reports"):
        try:
            result = run_once()
            _LAST_REFRESH_OK = True
            return result
        except AnalyticsError as exc:
            raise HTTPException(status_code=503, detail={"code": "ANALYTICS_UNAVAILABLE", "message": str(exc)}) from exc
    return _CACHE.snapshot()


@router.post("/refresh")
def refresh() -> dict[str, object | None]:
    """Recompute analytics synchronously and return the snapshot."""

    global _LAST_REFRESH_OK
    try:
        result = run_once()
        _LAST_REFRESH_OK = True
        return result
    except AnalyticsError as exc:
        _LAST_REFRESH_OK = False
        for ext in ("csv", "parquet"):
            path = _OUTPUT_DIR / f"history.{ext}"
            if path.exists():
                path.unlink()
        raise HTTPException(status_code=503, detail={"code": "ANALYTICS_UNAVAILABLE", "message": str(exc)}) from exc


def _resolve_history(ext: str) -> Path:
    path = _OUTPUT_DIR / f"history.{ext}"
    if not _LAST_REFRESH_OK or not path.exists():
        raise HTTPException(status_code=404, detail="HISTORY_NOT_FOUND")
    return path


@router.get("/history.csv")
def history_csv() -> FileResponse:
    """Return the CSV history export."""

    path = _resolve_history("csv")
    return FileResponse(path, media_type="text/csv", filename=path.name)


@router.get("/history.parquet")
def history_parquet() -> FileResponse:
    """Return the Parquet history export when available."""

    path = _resolve_history("parquet")
    return FileResponse(path, media_type="application/x-parquet", filename=path.name)
