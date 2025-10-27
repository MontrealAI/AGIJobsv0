"""FastAPI router exposing agent registry management endpoints."""

from __future__ import annotations

import hmac
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from orchestrator.agents import (
    AgentAssignmentError,
    AgentNotFoundError,
    AgentRegistryError,
    AgentUnauthorizedError,
    get_registry,
)
from orchestrator.models import AgentHeartbeatIn, AgentListOut, AgentRegistrationIn, AgentStatus, AgentUpdateIn


router = APIRouter(prefix="/agents", tags=["agents"])


def _owner_token() -> Optional[str]:
    return os.environ.get("AGENT_REGISTRY_OWNER_TOKEN")


def require_owner(x_owner_token: str = Header(..., alias="X-Owner-Token")) -> None:
    token = _owner_token()
    if not token:
        raise HTTPException(status_code=503, detail="OWNER_TOKEN_NOT_CONFIGURED")
    if not hmac.compare_digest(token, x_owner_token):
        raise HTTPException(status_code=403, detail="OWNER_TOKEN_INVALID")


def _handle_error(exc: AgentRegistryError) -> None:
    if isinstance(exc, AgentNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, AgentUnauthorizedError):
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    if isinstance(exc, AgentAssignmentError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("", response_model=AgentStatus, dependencies=[Depends(require_owner)])
def register_agent(payload: AgentRegistrationIn) -> AgentStatus:
    try:
        return get_registry().register(payload)
    except AgentRegistryError as exc:  # pragma: no cover - defensive
        _handle_error(exc)


@router.put("/{agent_id}", response_model=AgentStatus, dependencies=[Depends(require_owner)])
def update_agent(agent_id: str, payload: AgentUpdateIn) -> AgentStatus:
    try:
        return get_registry().update(agent_id, payload)
    except AgentRegistryError as exc:
        _handle_error(exc)


@router.delete("/{agent_id}", response_model=AgentStatus, dependencies=[Depends(require_owner)])
def deregister_agent(agent_id: str) -> AgentStatus:
    try:
        return get_registry().deregister(agent_id)
    except AgentRegistryError as exc:
        _handle_error(exc)


@router.get("", response_model=AgentListOut)
def list_agents(region: Optional[str] = Query(default=None), status: Optional[str] = Query(default=None)) -> AgentListOut:
    try:
        return get_registry().list(region=region, status=status)
    except AgentRegistryError as exc:  # pragma: no cover - defensive
        _handle_error(exc)


@router.get("/{agent_id}", response_model=AgentStatus)
def get_agent(agent_id: str) -> AgentStatus:
    try:
        return get_registry().get(agent_id)
    except AgentRegistryError as exc:
        _handle_error(exc)


@router.post("/{agent_id}/heartbeat", response_model=AgentStatus)
def agent_heartbeat(agent_id: str, payload: AgentHeartbeatIn) -> AgentStatus:
    try:
        return get_registry().record_heartbeat(agent_id, payload)
    except AgentRegistryError as exc:
        _handle_error(exc)


__all__ = [
    "router",
    "register_agent",
    "update_agent",
    "deregister_agent",
    "list_agents",
    "get_agent",
    "agent_heartbeat",
]
