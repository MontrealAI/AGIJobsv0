"""Production-ready FastAPI wrapper exposing the orchestrator routers."""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import time
from collections import defaultdict, deque
from typing import Deque, DefaultDict, Final

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from orchestrator.analytics import AnalyticsScheduler, AnalyticsEngine, get_cache, run_once
from routes.analytics import router as analytics_router
from routes.meta_orchestrator import router as meta_router
from routes.onebox import health_router, router as onebox_router

LOGGER: Final[logging.Logger] = logging.getLogger("agi.meta_api")

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
CSRF_COOKIE_NAME = "meta_csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"


class InMemoryRateLimiter:
    """Simple sliding-window rate limiter keyed by client identifier."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._enabled = max_requests > 0 and window_seconds > 0
        self._buckets: DefaultDict[str, Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def allow(self, key: str) -> tuple[bool, float | None]:
        if not self._enabled:
            return True, None
        now = time.monotonic()
        window_start = now - self._window_seconds
        async with self._lock:
            bucket = self._buckets[key]
            while bucket and bucket[0] < window_start:
                bucket.popleft()
            if len(bucket) >= self._max_requests:
                retry_after = bucket[0] + self._window_seconds - now
                return False, max(retry_after, 0.0)
            bucket.append(now)
        return True, None


class SecurityMiddleware(BaseHTTPMiddleware):
    """Attach CSRF and rate limiting protections to the orchestrator API."""

    def __init__(self, app: FastAPI, limiter: InMemoryRateLimiter) -> None:
        super().__init__(app)
        self._limiter = limiter

    async def dispatch(self, request: Request, call_next) -> Response:
        client_id = self._client_id(request)
        allowed, retry_after = await self._limiter.allow(client_id)
        if not allowed:
            headers = {"Retry-After": f"{int(retry_after or 0) + 1}"}
            return JSONResponse({"detail": "RATE_LIMITED"}, status_code=429, headers=headers)

        method = request.method.upper()
        if method not in SAFE_METHODS:
            header_token = request.headers.get(CSRF_HEADER_NAME)
            cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
            if not header_token or not cookie_token or not secrets.compare_digest(header_token, cookie_token):
                return JSONResponse({"detail": "CSRF token missing or invalid"}, status_code=403)

        response = await call_next(request)

        if method in SAFE_METHODS:
            cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
            if not cookie_token:
                token = secrets.token_urlsafe(32)
                response.set_cookie(
                    CSRF_COOKIE_NAME,
                    token,
                    httponly=False,
                    secure=True,
                    samesite="strict",
                    max_age=8 * 60 * 60,
                )
                response.headers[CSRF_HEADER_NAME.upper()] = token
        return response

    @staticmethod
    def _client_id(request: Request) -> str:
        auth = request.headers.get("authorization") or ""
        api_client = request.headers.get("x-api-client") or ""
        host = request.client.host if request.client else "anonymous"
        return ":".join(filter(None, (api_client.strip(), auth.strip(), host))) or host


def _configure_logging() -> None:
    level = os.environ.get("META_API_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=getattr(logging, level, logging.INFO))
    LOGGER.info("Meta API logging configured", extra={"level": level})


def create_app() -> FastAPI:
    """Instantiate the FastAPI application with all orchestrator routers."""

    _configure_logging()
    app = FastAPI(title="AGI Jobs Meta API", version="0.1.0", docs_url="/docs")

    max_requests = int(os.environ.get("META_API_RATE_LIMIT_MAX_REQUESTS", "60") or 0)
    window_seconds = int(os.environ.get("META_API_RATE_LIMIT_WINDOW_SECONDS", "60") or 0)
    limiter = InMemoryRateLimiter(max_requests, window_seconds)
    app.add_middleware(SecurityMiddleware, limiter=limiter)

    app.include_router(health_router)
    app.include_router(onebox_router)
    app.include_router(meta_router)
    app.include_router(analytics_router)

    scheduler = AnalyticsScheduler(AnalyticsEngine(), get_cache())

    @app.on_event("startup")
    async def _start_scheduler() -> None:  # pragma: no cover - FastAPI lifecycle wiring
        scheduler.start()
        if not get_cache().snapshot().get("reports"):
            try:
                run_once()
            except Exception:  # pragma: no cover - best-effort warm cache
                LOGGER.warning("analytics warmup failed", exc_info=True)

    @app.on_event("shutdown")
    async def _stop_scheduler() -> None:  # pragma: no cover - FastAPI lifecycle wiring
        scheduler.stop()

    @app.get("/healthz", tags=["health"])
    def root_health() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
