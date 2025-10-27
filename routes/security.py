"""Security utilities shared across API routers."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Optional

from fastapi import Header, HTTPException, Request


@dataclass(frozen=True)
class SecurityContext:
    """Represents the authenticated caller and associated role."""

    actor: str
    role: str
    token_hash: str


@dataclass(frozen=True)
class SecuritySettings:
    tokens: Dict[str, str]
    allowed_roles: set[str]
    default_token: Optional[str]
    default_role: str
    signing_secret: Optional[bytes]
    signature_tolerance: int
    rate_limit: int
    rate_window: float


def _parse_json_env(name: str) -> dict[str, str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover - configuration error path
        raise RuntimeError(f"Invalid JSON supplied for {name}: {exc}") from exc

    tokens: dict[str, str] = {}
    if isinstance(parsed, dict):
        for key, value in parsed.items():
            if isinstance(value, dict):
                role = value.get("role")
            else:
                role = value
            if isinstance(role, str):
                tokens[str(key)] = role
    return tokens


def _load_settings() -> SecuritySettings:
    tokens = {
        **_parse_json_env("ONEBOX_TOKEN_ROLES"),
        **_parse_json_env("API_TOKEN_ROLES"),
    }

    allowed_raw = os.getenv("ONEBOX_ALLOWED_ROLES") or os.getenv("API_ALLOWED_ROLES") or "operator,governance"
    allowed_roles = {role.strip() for role in allowed_raw.split(",") if role.strip()}
    if not allowed_roles:
        allowed_roles = {"operator"}

    default_token = os.getenv("ONEBOX_API_TOKEN") or os.getenv("API_TOKEN") or None
    default_role = os.getenv("ONEBOX_API_TOKEN_ROLE") or os.getenv("API_TOKEN_DEFAULT_ROLE") or "operator"

    signing_secret_env = os.getenv("ONEBOX_SIGNING_SECRET") or os.getenv("API_SIGNING_SECRET") or ""
    signing_secret = signing_secret_env.encode() if signing_secret_env else None

    tolerance = int(os.getenv("API_SIGNATURE_TOLERANCE_SECONDS", os.getenv("ONEBOX_SIGNATURE_TOLERANCE", "300")) or "300")
    rate_limit = int(os.getenv("ONEBOX_RATE_LIMIT_PER_MINUTE", os.getenv("API_RATE_LIMIT_PER_MINUTE", "120")) or "120")
    rate_window = float(os.getenv("API_RATE_LIMIT_WINDOW_SECONDS", "60"))

    return SecuritySettings(
        tokens=tokens,
        allowed_roles=allowed_roles,
        default_token=default_token,
        default_role=default_role,
        signing_secret=signing_secret,
        signature_tolerance=tolerance,
        rate_limit=rate_limit,
        rate_window=rate_window,
    )


_SETTINGS = _load_settings()


class RateLimiter:
    """Simple in-memory sliding window rate limiter."""

    def __init__(self, limit: int, window_seconds: float) -> None:
        self._limit = limit
        self._window = window_seconds
        self._buckets: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        if self._limit <= 0:
            return
        now = time.monotonic()
        bucket = self._buckets[key]
        window_start = now - self._window
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= self._limit:
            raise HTTPException(status_code=429, detail="RATE_LIMIT_EXCEEDED")
        bucket.append(now)

    def reset(self) -> None:
        self._buckets.clear()


_RATE_LIMITER = RateLimiter(_SETTINGS.rate_limit, _SETTINGS.rate_window)

_AUDIT_LOGGER = logging.getLogger("agi.meta_api.audit")


def reload_security_settings() -> None:
    """Reload environment-driven security settings (primarily for tests)."""

    global _SETTINGS, _RATE_LIMITER
    _SETTINGS = _load_settings()
    _RATE_LIMITER = RateLimiter(_SETTINGS.rate_limit, _SETTINGS.rate_window)


def reset_rate_limits() -> None:
    """Clear accumulated rate limiting buckets (useful for tests)."""

    _RATE_LIMITER.reset()


async def build_security_context(
    request: Request,
    authorization: Optional[str],
    signature: Optional[str],
    timestamp: Optional[str],
    actor_header: Optional[str],
    fallback_token: Optional[str] = None,
    fallback_role: Optional[str] = None,
) -> SecurityContext:
    tokens = dict(_SETTINGS.tokens)
    if fallback_token:
        tokens.setdefault(fallback_token, fallback_role or _SETTINGS.default_role)

    if not tokens and not _SETTINGS.signing_secret:
        context = SecurityContext(actor="anonymous", role="public", token_hash="")
        request.state.security_context = context
        return context

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="AUTH_MISSING")

    token = authorization.split(" ", 1)[1].strip()
    role = tokens.get(token)
    if role is None and _SETTINGS.default_token and token == _SETTINGS.default_token:
        role = _SETTINGS.default_role
    if role is None:
        raise HTTPException(status_code=401, detail="AUTH_INVALID")

    if role not in _SETTINGS.allowed_roles:
        raise HTTPException(status_code=403, detail="ROLE_FORBIDDEN")

    token_hash = hashlib.sha256(token.encode()).hexdigest()

    actor = actor_header or token_hash[:16]

    _RATE_LIMITER.check(token_hash)

    body = await request.body()
    request.state.raw_body = body

    if _SETTINGS.signing_secret is not None:
        if not timestamp:
            raise HTTPException(status_code=401, detail="SIGNATURE_TIMESTAMP_MISSING")
        try:
            sent_at = float(timestamp)
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="SIGNATURE_TIMESTAMP_INVALID") from exc
        if abs(time.time() - sent_at) > _SETTINGS.signature_tolerance:
            raise HTTPException(status_code=401, detail="SIGNATURE_EXPIRED")

        payload = f"{timestamp}.{body.decode('utf-8', errors='replace')}".encode()
        expected = hmac.new(_SETTINGS.signing_secret, payload, hashlib.sha256).hexdigest()
        if not signature or not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="SIGNATURE_INVALID")

    context = SecurityContext(actor=actor, role=role, token_hash=token_hash)
    request.state.security_context = context

    _AUDIT_LOGGER.info(
        "security.authenticated",
        extra={"actor": actor, "role": role, "path": request.url.path, "method": request.method},
    )

    return context


async def require_security(
    request: Request,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    signature: Optional[str] = Header(None, alias="X-Signature"),
    timestamp: Optional[str] = Header(None, alias="X-Timestamp"),
    actor_header: Optional[str] = Header(None, alias="X-Actor"),
    fallback_token: Optional[str] = None,
    fallback_role: Optional[str] = None,
) -> SecurityContext:
    return await build_security_context(
        request,
        authorization,
        signature,
        timestamp,
        actor_header,
        fallback_token=fallback_token,
        fallback_role=fallback_role,
    )


def audit_event(context: SecurityContext, action: str, **extra: object) -> None:
    payload = {"actor": context.actor, "role": context.role, **extra}
    _AUDIT_LOGGER.info(action, extra=payload)

