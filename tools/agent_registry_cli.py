"""Operator friendly CLI for managing the agent registry."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable, List

import httpx

from orchestrator.agents import AgentRegistry, AgentRegistryError, get_registry, reset_registry
from orchestrator.models import (
    AgentCapability,
    AgentHeartbeatIn,
    AgentRegistrationIn,
    AgentSecurityControls,
    AgentStake,
    AgentUpdateIn,
)

TEMPLATE_COMPOSE = """\
version: "3.9"
services:
  agent-node:
    build:
      context: ..
      dockerfile: deploy/docker/agent-node.Dockerfile
    environment:
      AGENT_ID: {agent_id}
      AGENT_REGION: {region}
      AGENT_CAPABILITIES: {capabilities}
      AGENT_ROUTER: {router}
      AGENT_REGISTRY_URL: {registry_url}
      AGENT_REGISTRY_OWNER_TOKEN: ${AGENT_REGISTRY_OWNER_TOKEN}
      AGENT_HEARTBEAT_SECRET: {secret}
    volumes:
      - ./agent-data:/var/lib/agent
    restart: unless-stopped
"""


def _ensure_registry(path: Path | None) -> AgentRegistry:
    if path:
        reset_registry()
        return AgentRegistry(path=path)
    return get_registry()


def _use_remote(args: argparse.Namespace) -> bool:
    return bool(args.api_url)


def _endpoint(args: argparse.Namespace, suffix: str = "") -> str:
    if not args.api_url:
        raise RuntimeError("API URL not configured")
    base = args.api_url.rstrip("/")
    return f"{base}{suffix}"


def _owner_headers(args: argparse.Namespace) -> dict[str, str]:
    headers: dict[str, str] = {}
    if args.owner_token:
        headers["X-Owner-Token"] = args.owner_token
    return headers


def _perform_request(
    args: argparse.Namespace,
    method: str,
    suffix: str,
    json_payload: dict | None = None,
    params: dict | None = None,
) -> dict:
    url = _endpoint(args, suffix)
    headers = _owner_headers(args)
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.request(method, url, json=json_payload, params=params, headers=headers)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text if exc.response else str(exc)
        raise SystemExit(f"API {method} {url} failed: {exc.response.status_code if exc.response else ''} {detail}") from exc
    except httpx.HTTPError as exc:
        raise SystemExit(f"API request failed: {exc}") from exc
    return response.json()


def _parse_capabilities(raw: Iterable[str]) -> List[AgentCapability]:
    capabilities: List[AgentCapability] = []
    for value in raw:
        value = value.strip()
        if not value:
            continue
        try:
            capabilities.append(AgentCapability(value))
        except ValueError:
            raise SystemExit(f"Unknown capability `{value}`")
    if not capabilities:
        raise SystemExit("At least one capability is required")
    return capabilities


def command_register(args: argparse.Namespace) -> None:
    payload = AgentRegistrationIn(
        agent_id=args.agent_id,
        owner=args.owner,
        region=args.region,
        capabilities=_parse_capabilities(args.capabilities.split(",")),
        stake=AgentStake(amount=args.stake, token=args.stake_token, slashable=not args.nonslashable),
        security=AgentSecurityControls(
            requires_kyc=args.requires_kyc,
            multisig=args.multisig,
            isolation_level=args.isolation_level,
            hardware_root_of_trust=args.hardware_root,
            notes=args.security_notes,
        ),
        router=args.router,
        operator_secret=args.secret,
    )
    if _use_remote(args):
        if not args.owner_token:
            raise SystemExit("--owner-token is required when using --api-url for registration")
        data = payload.model_dump(mode="json")
        result = _perform_request(args, "POST", "", data)
        print(json.dumps(result, indent=2))
        return
    registry = _ensure_registry(args.registry_path)
    try:
        result = registry.register(payload)
    except AgentRegistryError as exc:
        raise SystemExit(f"Registration failed: {exc}") from exc
    print(json.dumps(result.model_dump(mode="json"), indent=2))


def command_update(args: argparse.Namespace) -> None:
    capabilities = (
        _parse_capabilities(args.capabilities.split(",")) if args.capabilities else None
    )
    stake = (
        AgentStake(amount=args.stake, token=args.stake_token, slashable=not args.nonslashable)
        if args.stake is not None
        else None
    )
    security = None
    if (
        args.requires_kyc is not None
        or args.multisig is not None
        or args.isolation_level is not None
        or args.hardware_root is not None
        or args.security_notes is not None
    ):
        security = AgentSecurityControls(
            requires_kyc=args.requires_kyc if args.requires_kyc is not None else False,
            multisig=args.multisig if args.multisig is not None else False,
            isolation_level=args.isolation_level or "process",
            hardware_root_of_trust=args.hardware_root if args.hardware_root is not None else False,
            notes=args.security_notes,
        )
    payload = AgentUpdateIn(
        region=args.region,
        capabilities=capabilities,
        stake=stake,
        security=security,
        router=args.router,
        status=args.status,
        operator_secret=args.secret,
    )
    if _use_remote(args):
        if not args.owner_token:
            raise SystemExit("--owner-token is required when using --api-url for updates")
        data = payload.model_dump(mode="json", exclude_none=True)
        result = _perform_request(args, "PUT", f"/{args.agent_id}", data)
        print(json.dumps(result, indent=2))
        return
    registry = _ensure_registry(args.registry_path)
    try:
        result = registry.update(args.agent_id, payload)
    except AgentRegistryError as exc:
        raise SystemExit(f"Update failed: {exc}") from exc
    print(json.dumps(result.model_dump(mode="json"), indent=2))


def command_list(args: argparse.Namespace) -> None:
    if _use_remote(args):
        params = {}
        if args.region:
            params["region"] = args.region
        if args.status:
            params["status"] = args.status
        result = _perform_request(args, "GET", "", params=params)
        print(json.dumps(result, indent=2))
        return
    registry = _ensure_registry(args.registry_path)
    try:
        result = registry.list(region=args.region, status=args.status)
    except AgentRegistryError as exc:
        raise SystemExit(f"Listing failed: {exc}") from exc
    print(json.dumps(result.model_dump(mode="json"), indent=2))


def command_remove(args: argparse.Namespace) -> None:
    if _use_remote(args):
        if not args.owner_token:
            raise SystemExit("--owner-token is required when using --api-url for deregistration")
        result = _perform_request(args, "DELETE", f"/{args.agent_id}")
        print(json.dumps(result, indent=2))
        return
    registry = _ensure_registry(args.registry_path)
    try:
        result = registry.deregister(args.agent_id)
    except AgentRegistryError as exc:
        raise SystemExit(f"Deregistration failed: {exc}") from exc
    print(json.dumps(result.model_dump(mode="json"), indent=2))


def command_heartbeat(args: argparse.Namespace) -> None:
    payload = AgentHeartbeatIn(router=args.router, secret=args.secret)
    if _use_remote(args):
        data = payload.model_dump(mode="json", exclude_none=True)
        result = _perform_request(args, "POST", f"/{args.agent_id}/heartbeat", data)
        print(json.dumps(result, indent=2))
        return
    registry = _ensure_registry(args.registry_path)
    try:
        result = registry.record_heartbeat(args.agent_id, payload)
    except AgentRegistryError as exc:
        raise SystemExit(f"Heartbeat failed: {exc}") from exc
    print(json.dumps(result.model_dump(mode="json"), indent=2))


def command_template(args: argparse.Namespace) -> None:
    compose = TEMPLATE_COMPOSE.format(
        agent_id=args.agent_id,
        region=args.region,
        capabilities=args.capabilities,
        router=args.router,
        registry_url=args.registry_url,
        secret=args.secret,
    )
    Path(args.output).write_text(compose, encoding="utf-8")
    print(f"Wrote docker compose template to {args.output}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage agent registry entries from the command line.")
    parser.add_argument("--registry-path", type=Path, default=None, help="Override registry persistence path (local mode).")
    parser.add_argument("--api-url", default=None, help="Remote agent registry API base (e.g. http://localhost:8000/agents)")
    parser.add_argument("--owner-token", default=None, help="Owner governance token for remote mutations.")

    subparsers = parser.add_subparsers(dest="command", required=True)

    register = subparsers.add_parser("register", help="Register a new agent")
    register.add_argument("agent_id")
    register.add_argument("owner")
    register.add_argument("region")
    register.add_argument("capabilities", help="Comma separated capability list (router,execution,validation,analysis,support)")
    register.add_argument("stake", help="Stake amount", type=str)
    register.add_argument("secret", help="Shared heartbeat secret")
    register.add_argument("--stake-token", default="AGIALPHA")
    register.add_argument("--router", default=None)
    register.add_argument("--requires-kyc", action="store_true")
    register.add_argument("--multisig", action="store_true")
    register.add_argument("--isolation-level", default="process")
    register.add_argument("--hardware-root", action="store_true")
    register.add_argument("--security-notes", default=None)
    register.add_argument("--nonslashable", action="store_true")
    register.set_defaults(func=command_register)

    update = subparsers.add_parser("update", help="Update an existing agent")
    update.add_argument("agent_id")
    update.add_argument("--region")
    update.add_argument("--capabilities")
    update.add_argument("--stake")
    update.add_argument("--stake-token", default="AGIALPHA")
    update.add_argument("--router")
    update.add_argument("--status")
    update.add_argument("--secret")
    update.add_argument("--requires-kyc", dest="requires_kyc", action="store_const", const=True, default=None)
    update.add_argument("--no-requires-kyc", dest="requires_kyc", action="store_const", const=False)
    update.add_argument("--multisig", dest="multisig", action="store_const", const=True, default=None)
    update.add_argument("--no-multisig", dest="multisig", action="store_const", const=False)
    update.add_argument("--isolation-level", default=None)
    update.add_argument("--hardware-root", dest="hardware_root", action="store_const", const=True, default=None)
    update.add_argument("--no-hardware-root", dest="hardware_root", action="store_const", const=False)
    update.add_argument("--security-notes", default=None)
    update.add_argument("--nonslashable", action="store_true")
    update.set_defaults(func=command_update)

    list_parser = subparsers.add_parser("list", help="List registered agents")
    list_parser.add_argument("--region")
    list_parser.add_argument("--status")
    list_parser.set_defaults(func=command_list)

    remove = subparsers.add_parser("remove", help="Remove an agent")
    remove.add_argument("agent_id")
    remove.set_defaults(func=command_remove)

    heartbeat = subparsers.add_parser("heartbeat", help="Send a heartbeat for an agent")
    heartbeat.add_argument("agent_id")
    heartbeat.add_argument("secret")
    heartbeat.add_argument("--router")
    heartbeat.set_defaults(func=command_heartbeat)

    template = subparsers.add_parser("template", help="Generate a docker-compose template")
    template.add_argument("agent_id")
    template.add_argument("region")
    template.add_argument("capabilities")
    template.add_argument("router")
    template.add_argument("registry_url")
    template.add_argument("secret")
    template.add_argument("--output", default="agent-node.compose.yaml")
    template.set_defaults(func=command_template)

    return parser


def main(argv: List[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main(sys.argv[1:])
