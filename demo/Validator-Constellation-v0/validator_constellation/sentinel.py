from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from .events import EventBus


def _hash_target(value: str) -> str:
    return hashlib.sha3_256(value.lower().encode()).hexdigest()


@dataclass
class AgentAction:
    agent: str
    domain: str
    spend: float
    call: str
    metadata: Dict[str, object] | None = None
    target: str | None = None
    opcode: str | None = None
    calldata_bytes: int | None = None


@dataclass
class SentinelAlert:
    domain: str
    agent: str
    rule: str
    description: str


class DomainPauseController:
    def __init__(self, bus: EventBus, domains: Iterable[Dict[str, object]]) -> None:
        self.bus = bus
        self.domains: Dict[str, Dict[str, object]] = {}
        self.paused: Dict[str, Dict[str, object]] = {}
        for domain in domains:
            entry = dict(domain)
            entry.setdefault("unsafe_opcodes", [])
            entry.setdefault("allowed_targets", [])
            entry.setdefault("max_calldata_bytes", 4096)
            entry.setdefault("forbidden_selectors", [])
            entry["allowed_target_hashes"] = {
                _hash_target(target) for target in entry["allowed_targets"]
            }
            self.domains[entry["domain"]] = entry

    def pause(self, domain: str, *, reason: str, triggered_by: str) -> None:
        info = {
            "reason": reason,
            "triggered_by": triggered_by,
        }
        self.paused[domain] = info
        self.bus.emit(
            "DomainPaused",
            domain=domain,
            reason=reason,
            triggeredBy=triggered_by,
        )

    def resume(self, domain: str, operator: str) -> None:
        if domain in self.paused:
            del self.paused[domain]
            self.bus.emit(
                "DomainResumed",
                domain=domain,
                operator=operator,
            )

    def is_paused(self, domain: str) -> bool:
        return domain in self.paused

    def update_domain(self, domain: str, **updates: object) -> None:
        if domain not in self.domains:
            raise KeyError(domain)
        self.domains[domain].update(updates)
        if "allowed_targets" in updates:
            self.domains[domain]["allowed_target_hashes"] = {
                _hash_target(target) for target in self.domains[domain]["allowed_targets"]
            }


class SentinelMonitor:
    def __init__(self, *, pause_controller: DomainPauseController, event_bus: EventBus) -> None:
        self.pause_controller = pause_controller
        self.bus = event_bus

    def evaluate(self, action: AgentAction) -> Optional[SentinelAlert]:
        domain = self.pause_controller.domains.get(action.domain)
        if not domain:
            return None
        metadata = action.metadata or {}
        target_hash = metadata.get("targetHash") or (
            _hash_target(action.target)
            if action.target and action.target.startswith("0x")
            else (_hash_target(action.target) if action.target else None)
        )
        if target_hash is None and metadata.get("target"):
            target_hash = _hash_target(str(metadata["target"]))
        if target_hash and target_hash in domain.get("allowed_target_hashes", set()):
            allowed_target_violation = False
        else:
            allowed_target_violation = target_hash is not None and domain.get("allowed_target_hashes")
        budget_limit = domain.get("budget_limit", float("inf"))
        spend = float(action.spend)
        if "budget" in metadata:
            spend = max(spend, float(metadata["budget"]))
        calldata_bytes = metadata.get("calldataBytes") if isinstance(metadata, dict) else None
        if calldata_bytes is None:
            calldata_bytes = action.calldata_bytes or 0
        violations: List[SentinelAlert] = []
        if spend > float(budget_limit):
            violations.append(
                SentinelAlert(
                    domain=action.domain,
                    agent=action.agent,
                    rule="BUDGET_OVERRUN",
                    description="Budget limit exceeded",
                )
            )
        opcode = metadata.get("opcode") if isinstance(metadata, dict) else None
        opcode = opcode or action.opcode
        if opcode and opcode in set(domain.get("unsafe_opcodes", [])):
            violations.append(
                SentinelAlert(
                    domain=action.domain,
                    agent=action.agent,
                    rule="UNSAFE_OPCODE",
                    description=f"Opcode {opcode} is disallowed",
                )
            )
        selector = metadata.get("selector") if isinstance(metadata, dict) else None
        if selector and selector in set(domain.get("forbidden_selectors", [])):
            violations.append(
                SentinelAlert(
                    domain=action.domain,
                    agent=action.agent,
                    rule="FORBIDDEN_SELECTOR",
                    description=f"Selector {selector} is blocked",
                )
            )
        if allowed_target_violation:
            violations.append(
                SentinelAlert(
                    domain=action.domain,
                    agent=action.agent,
                    rule="UNAUTHORIZED_TARGET",
                    description="Target not on allowlist",
                )
            )
        if calldata_bytes > int(domain.get("max_calldata_bytes", 0)):
            violations.append(
                SentinelAlert(
                    domain=action.domain,
                    agent=action.agent,
                    rule="CALLDATA_LIMIT",
                    description="Calldata exceeds allowed size",
                )
            )
        if not violations:
            return None
        alert = violations[0]
        self.bus.emit(
            "SentinelAlert",
            domain=alert.domain,
            agent=alert.agent,
            rule=alert.rule,
            description=alert.description,
        )
        self.pause_controller.pause(alert.domain, reason=alert.description, triggered_by=alert.agent)
        return alert

    def resume_domain(self, domain: str, operator: str) -> None:
        self.pause_controller.resume(domain, operator)
