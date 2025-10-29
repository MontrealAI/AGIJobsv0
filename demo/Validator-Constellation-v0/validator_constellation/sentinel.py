"""Sentinel anomaly detection and domain pause controls."""

from __future__ import annotations

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Callable, Dict, Iterable, List, Optional, Tuple
from uuid import uuid4

from .events import EventBus


def _normalize_target(value: str) -> str:
    return value.strip().lower()


def _hash_target(value: str) -> str:
    return hashlib.sha3_256(value.encode()).hexdigest()


def _normalize_selector(value: str) -> str:
    normalized = value.strip().lower()
    if not normalized.startswith("0x"):
        normalized = f"0x{normalized}"
    return normalized


@dataclass(slots=True)
class AgentAction:
    agent: str
    domain: str
    spend: float | Decimal
    call: str
    metadata: Dict[str, object] = field(default_factory=dict)
    opcode: Optional[str] = None
    target: Optional[str] = None
    calldata_bytes: Optional[int] = None
    function_selector: Optional[str] = None
    block_number: Optional[int] = None
    agent_address: Optional[str] = None


@dataclass(slots=True)
class SentinelAlert:
    id: str
    domain: str
    reason: str
    rule: str
    severity: str
    action: AgentAction
    timestamp: datetime
    block_number: Optional[int]
    metadata: Dict[str, object]


@dataclass(slots=True)
class SentinelRule:
    name: str
    description: str
    predicate: Callable[[AgentAction, "DomainState"], bool]
    severity: str = "HIGH"


@dataclass(slots=True)
class PauseRecord:
    domain: str
    reason: str
    triggered_by: str
    timestamp: datetime
    block_number: Optional[int]
    metadata: Dict[str, object] = field(default_factory=dict)
    resumed_at: Optional[datetime] = None
    resumed_by: Optional[str] = None
    resumed_block: Optional[int] = None


@dataclass(slots=True)
class DomainState:
    id: str
    human_name: str
    budget_limit: Decimal
    unsafe_opcodes: set[str] = field(default_factory=set)
    allowed_targets: set[str] = field(default_factory=set)
    allowed_target_hashes: set[str] = field(default_factory=set)
    max_calldata_bytes: int = 0
    forbidden_selectors: set[str] = field(default_factory=set)
    pause_record: Optional[PauseRecord] = None

    @property
    def paused(self) -> bool:
        return self.pause_record is not None


class DomainPauseController:
    """Manages emergency domain pauses triggered by Sentinel alerts."""

    def __init__(self, event_bus: EventBus, domains: Optional[Iterable[Dict[str, object]]] = None) -> None:
        self._event_bus = event_bus
        self._domains: Dict[str, DomainState] = {}
        if domains:
            for domain in domains:
                self.register_domain(**domain)

    def register_domain(
        self,
        *,
        domain: str,
        human_name: str,
        budget_limit: float | Decimal,
        unsafe_opcodes: Iterable[str] | None = None,
        allowed_targets: Iterable[str] | None = None,
        max_calldata_bytes: int = 0,
        forbidden_selectors: Iterable[str] | None = None,
    ) -> DomainState:
        normalized_targets = {_normalize_target(target) for target in allowed_targets or ()}
        hashed_targets = set()
        for target in normalized_targets:
            hashed = _hash_target(target)
            hashed_targets.add(hashed)
            hashed_targets.add(f"0x{hashed}")
        state = DomainState(
            id=domain,
            human_name=human_name,
            budget_limit=Decimal(str(budget_limit)),
            unsafe_opcodes={opcode.upper() for opcode in (unsafe_opcodes or ())},
            allowed_targets=normalized_targets,
            allowed_target_hashes=hashed_targets,
            max_calldata_bytes=max(0, int(max_calldata_bytes)),
            forbidden_selectors={_normalize_selector(selector) for selector in (forbidden_selectors or ())},
        )
        self._domains[state.id] = state
        self._event_bus.publish(
            "DomainRegistered",
            {
                "domain": state.id,
                "humanName": state.human_name,
                "budgetLimit": float(state.budget_limit),
                "maxCalldataBytes": state.max_calldata_bytes,
            },
        )
        return state

    def _get(self, domain: str) -> DomainState:
        if domain not in self._domains:
            raise KeyError(f"Unknown domain '{domain}'")
        return self._domains[domain]

    def pause(
        self,
        domain: str,
        reason: str,
        triggered_by: str,
        block_number: Optional[int] = None,
        metadata: Optional[Dict[str, object]] = None,
    ) -> PauseRecord:
        state = self._get(domain)
        if state.pause_record:
            return state.pause_record
        timestamp = datetime.now(timezone.utc)
        record = PauseRecord(
            domain=state.id,
            reason=reason,
            triggered_by=triggered_by,
            timestamp=timestamp,
            block_number=block_number,
            metadata=dict(metadata or {}),
        )
        state.pause_record = record
        self._event_bus.publish(
            "DomainPaused",
            {
                "domain": state.id,
                "humanName": state.human_name,
                "reason": reason,
                "triggeredBy": triggered_by,
                "timestamp": timestamp.isoformat(),
                "blockNumber": block_number,
                "metadata": record.metadata,
            },
        )
        return record

    def resume(self, domain: str, operator: str, block_number: Optional[int] = None) -> PauseRecord:
        state = self._get(domain)
        if not state.pause_record:
            raise RuntimeError("Domain is not paused")
        record = state.pause_record
        record.resumed_at = datetime.now(timezone.utc)
        record.resumed_by = operator
        record.resumed_block = block_number
        state.pause_record = None
        self._event_bus.publish(
            "DomainResumed",
            {
                "domain": state.id,
                "humanName": state.human_name,
                "operator": operator,
                "resumedAt": record.resumed_at.isoformat(),
                "blockNumber": block_number,
            },
        )
        return record

    def update_domain(
        self,
        domain: str,
        *,
        human_name: Optional[str] = None,
        budget_limit: Optional[float | Decimal] = None,
        unsafe_opcodes: Optional[Iterable[str]] = None,
        allowed_targets: Optional[Iterable[str]] = None,
        max_calldata_bytes: Optional[int] = None,
        forbidden_selectors: Optional[Iterable[str]] = None,
    ) -> DomainState:
        state = self._get(domain)
        if human_name is not None:
            state.human_name = human_name
        if budget_limit is not None:
            state.budget_limit = Decimal(str(budget_limit))
        if unsafe_opcodes is not None:
            state.unsafe_opcodes = {opcode.upper() for opcode in unsafe_opcodes}
        if allowed_targets is not None:
            normalized_targets = {_normalize_target(target) for target in allowed_targets}
            hashed_targets = set()
            for target in normalized_targets:
                hashed = _hash_target(target)
                hashed_targets.add(hashed)
                hashed_targets.add(f"0x{hashed}")
            state.allowed_targets = normalized_targets
            state.allowed_target_hashes = hashed_targets
        if max_calldata_bytes is not None:
            state.max_calldata_bytes = max(0, int(max_calldata_bytes))
        if forbidden_selectors is not None:
            state.forbidden_selectors = {_normalize_selector(selector) for selector in forbidden_selectors}
        self._event_bus.publish(
            "DomainSafetyUpdated",
            {
                "domain": state.id,
                "humanName": state.human_name,
                "budgetLimit": float(state.budget_limit),
                "maxCalldataBytes": state.max_calldata_bytes,
                "unsafeOpcodes": sorted(state.unsafe_opcodes),
                "allowedTargets": sorted(state.allowed_targets),
                "forbiddenSelectors": sorted(state.forbidden_selectors),
            },
        )
        return state

    def is_paused(self, domain: str) -> bool:
        return self._get(domain).paused

    @property
    def paused_domains(self) -> Dict[str, PauseRecord]:
        return {domain: state.pause_record for domain, state in self._domains.items() if state.pause_record}

    def get_state(self, domain: str) -> DomainState:
        return self._get(domain)

    def list_domains(self) -> Tuple[DomainState, ...]:
        return tuple(self._domains.values())


class SentinelMonitor:
    """Runs deterministic anomaly detection rules across agent actions."""

    def __init__(
        self,
        *,
        pause_controller: DomainPauseController,
        event_bus: EventBus,
        budget_grace_ratio: float = 0.05,
        custom_rules: Optional[Iterable[SentinelRule]] = None,
    ) -> None:
        self._pause_controller = pause_controller
        self._event_bus = event_bus
        self._budget_grace_ratio = Decimal(str(budget_grace_ratio))
        self._spend_tracker: Dict[Tuple[str, str], Decimal] = {}
        self._custom_rules = list(custom_rules or [])
        self.alerts: List[SentinelAlert] = []

    def evaluate(self, action: AgentAction) -> Optional[SentinelAlert]:
        state = self._pause_controller.get_state(action.domain)
        if state.paused:
            return None

        block_number = action.block_number
        if block_number is None:
            block_metadata = action.metadata.get("blockNumber") or action.metadata.get("block")
            if isinstance(block_metadata, int):
                block_number = block_metadata

        alert = self._check_budget(state, action, block_number)
        if alert:
            return alert

        alert = self._check_opcode(state, action, block_number)
        if alert:
            return alert

        alert = self._check_selector(state, action, block_number)
        if alert:
            return alert

        alert = self._check_target(state, action, block_number)
        if alert:
            return alert

        alert = self._check_calldata(state, action, block_number)
        if alert:
            return alert

        if action.metadata.get("restricted"):
            return self._raise_alert(
                state,
                action,
                rule="RESTRICTED_CALL",
                reason="Agent invoked a restricted function",
                severity="CRITICAL",
                metadata={"call": action.call},
                block_number=block_number,
            )

        for rule in self._custom_rules:
            if rule.predicate(action, state):
                return self._raise_alert(
                    state,
                    action,
                    rule=rule.name,
                    reason=rule.description,
                    severity=rule.severity,
                    metadata=dict(action.metadata),
                    block_number=block_number,
                )

        return None

    def _check_budget(
        self, state: DomainState, action: AgentAction, block_number: Optional[int]
    ) -> Optional[SentinelAlert]:
        tracker_key = (
            state.id,
            (action.agent_address or action.agent).lower(),
        )
        spend = Decimal(str(action.spend))
        previous = self._spend_tracker.get(tracker_key, Decimal(0))
        updated = previous + spend
        self._spend_tracker[tracker_key] = updated

        raw_budget = action.metadata.get("budget") or action.metadata.get("budgetLimit")
        budget = Decimal(str(raw_budget)) if raw_budget is not None else state.budget_limit
        if budget <= 0:
            budget = state.budget_limit
        grace = budget * self._budget_grace_ratio
        if updated > budget + grace:
            return self._raise_alert(
                state,
                action,
                rule="BUDGET_OVERRUN",
                reason=f"Agent exceeded budget in {state.human_name}",
                severity="CRITICAL",
                metadata={
                    "spent": float(updated),
                    "budget": float(budget),
                    "grace": float(grace),
                },
                block_number=block_number,
            )
        return None

    def _check_opcode(
        self, state: DomainState, action: AgentAction, block_number: Optional[int]
    ) -> Optional[SentinelAlert]:
        if not action.opcode:
            return None
        opcode = action.opcode.upper()
        if opcode in state.unsafe_opcodes:
            return self._raise_alert(
                state,
                action,
                rule="UNSAFE_OPCODE",
                reason=f"Unsafe opcode {opcode} invoked",
                severity="HIGH",
                metadata={"opcode": opcode},
                block_number=block_number,
            )
        return None

    def _check_selector(
        self, state: DomainState, action: AgentAction, block_number: Optional[int]
    ) -> Optional[SentinelAlert]:
        selector = action.function_selector or action.metadata.get("functionSelector")
        if selector is None:
            selector = action.metadata.get("function_selector")
        if not isinstance(selector, str):
            return None
        normalized = _normalize_selector(selector)
        if normalized in state.forbidden_selectors:
            return self._raise_alert(
                state,
                action,
                rule="FORBIDDEN_SELECTOR",
                reason=f"Function selector {normalized} blocked",
                severity="CRITICAL",
                metadata={
                    "selector": normalized,
                    "allowed": sorted(state.forbidden_selectors),
                },
                block_number=block_number,
            )
        return None

    def _check_target(
        self, state: DomainState, action: AgentAction, block_number: Optional[int]
    ) -> Optional[SentinelAlert]:
        if not state.allowed_targets and not state.allowed_target_hashes:
            return None
        target = action.target or action.metadata.get("target")
        metadata_hash = action.metadata.get("targetHash") or action.metadata.get("target_hash")
        normalized_target: Optional[str] = None
        candidate_hashes: List[str] = []
        if isinstance(target, str):
            normalized_target = _normalize_target(target)
            candidate_hashes.extend(
                filter(
                    None,
                    [
                        normalized_target,
                        _hash_target(normalized_target),
                    ],
                )
            )
            if normalized_target in state.allowed_targets:
                return None
            if any(candidate in state.allowed_target_hashes for candidate in candidate_hashes):
                return None
        normalized_hash: Optional[str] = None
        if isinstance(metadata_hash, str):
            normalized_hash = _normalize_target(metadata_hash)
            if (
                normalized_hash in state.allowed_target_hashes
                and (normalized_target is None or normalized_hash in candidate_hashes)
            ):
                return None
        if isinstance(target, str) or isinstance(metadata_hash, str):
            return self._raise_alert(
                state,
                action,
                rule="UNAUTHORIZED_TARGET",
                reason=f"Target {target or metadata_hash} is not authorised",
                severity="CRITICAL",
                metadata={
                    "target": target,
                    "normalized": normalized_target,
                    "targetHash": metadata_hash,
                    "metadataNormalized": normalized_hash,
                },
                block_number=block_number,
            )
        return None

    def _check_calldata(
        self, state: DomainState, action: AgentAction, block_number: Optional[int]
    ) -> Optional[SentinelAlert]:
        if state.max_calldata_bytes <= 0:
            return None
        calldata_bytes = action.calldata_bytes
        if calldata_bytes is None:
            raw = action.metadata.get("calldataBytes") or action.metadata.get("calldata_bytes")
            if raw is not None:
                calldata_bytes = int(raw)
        if calldata_bytes is None:
            return None
        if calldata_bytes > state.max_calldata_bytes:
            return self._raise_alert(
                state,
                action,
                rule="CALLDATA_EXPLOSION",
                reason=f"Calldata size {calldata_bytes}b exceeds limit",
                severity="HIGH",
                metadata={
                    "calldataBytes": calldata_bytes,
                    "threshold": state.max_calldata_bytes,
                },
                block_number=block_number,
            )
        return None

    def _raise_alert(
        self,
        state: DomainState,
        action: AgentAction,
        *,
        rule: str,
        reason: str,
        severity: str,
        metadata: Dict[str, object],
        block_number: Optional[int],
    ) -> SentinelAlert:
        record = self._pause_controller.pause(
            state.id,
            reason=reason,
            triggered_by=f"sentinel::{rule}",
            block_number=block_number,
            metadata={
                "agent": action.agent,
                "call": action.call,
                **metadata,
            },
        )
        alert = SentinelAlert(
            id=f"{rule}-{uuid4().hex}",
            domain=state.id,
            reason=reason,
            rule=rule,
            severity=severity,
            action=action,
            timestamp=record.timestamp,
            block_number=block_number,
            metadata=dict(metadata),
        )
        self.alerts.append(alert)
        spend_value = float(Decimal(str(action.spend)))
        self._event_bus.publish(
            "SentinelAlert",
            {
                "domain": state.id,
                "humanName": state.human_name,
                "rule": rule,
                "reason": reason,
                "severity": severity,
                "agent": action.agent,
                "agentAddress": action.agent_address,
                "call": action.call,
                "spend": spend_value,
                "metadata": metadata,
                "blockNumber": block_number,
                "pauseRecord": {
                    "triggeredBy": record.triggered_by,
                    "timestamp": record.timestamp.isoformat(),
                    "reason": record.reason,
                },
            },
        )
        return alert

    def resume_domain(self, domain: str, operator: str, block_number: Optional[int] = None) -> PauseRecord:
        return self._pause_controller.resume(domain, operator, block_number=block_number)

    def add_rule(self, rule: SentinelRule) -> None:
        self._custom_rules.append(rule)

    def update_budget_grace_ratio(self, ratio: float) -> None:
        if ratio < 0:
            raise ValueError("Budget grace ratio cannot be negative")
        self._budget_grace_ratio = Decimal(str(ratio))

    def get_budget_grace_ratio(self) -> float:
        return float(self._budget_grace_ratio)

    def update_domain_policy(self, domain: str, **changes: object) -> DomainState:
        return self._pause_controller.update_domain(domain, **changes)

    def domain_policy(self, domain: str) -> DomainState:
        return self._pause_controller.get_state(domain)
