"""Phase 6 expansion runtime helpers.

The runtime consumes on-chain domain configuration snapshots exported by the
Phase6ExpansionManager contract and provides rich annotations for the Python
orchestrator. Non-technical operators can point the orchestrator at a JSON file
exported from the subgraph and the runtime will suggest domain candidates,
surface declared metadata and generate non-executable bridge plans. It does not
verify chain state, credentials, permissions, oracle observations or settlement.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import time
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - imported during type checking only
    from ..models import Step

_LOG = logging.getLogger(__name__)
_DEFAULT_CONFIG = Path(__file__).resolve().parents[2] / "demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json"
_ZERO_BYTES32 = "0x" + "0" * 64


@dataclass(slots=True)
class DomainProfile:
    """Normalized representation of a domain exported by the on-chain registry."""

    slug: str
    name: str
    manifest_uri: str
    subgraph: str
    l2_gateway: Optional[str] = None
    oracle: Optional[str] = None
    execution_router: Optional[str] = None
    heartbeat_seconds: float = 120.0
    skill_tags: Set[str] = field(default_factory=set)
    capability_matrix: Dict[str, float] = field(default_factory=dict)
    priority: float = 0.0
    metadata: Dict[str, object] = field(default_factory=dict)
    resilience_index: float = 0.0
    value_flow_usd: Optional[float] = None
    value_flow_display: Optional[str] = None
    uptime: Optional[str] = None
    sentinel: Optional[str] = None
    infrastructure: List[Dict[str, str]] = field(default_factory=list)
    max_active_jobs: int = 0
    max_queue_depth: int = 0
    min_stake: int = 0
    treasury_share_bps: int = 0
    circuit_breaker_bps: int = 0
    requires_human_validation: bool = False
    telemetry_resilience_bps: int = 0
    telemetry_automation_bps: int = 0
    telemetry_compliance_bps: int = 0
    settlement_latency_seconds: float = 0.0
    uses_l2_settlement: bool = False
    sentinel_oracle: Optional[str] = None
    settlement_asset: Optional[str] = None
    telemetry_metrics_digest: Optional[str] = None
    telemetry_manifest_hash: Optional[str] = None
    credentials: List[Dict[str, object]] = field(default_factory=list)
    active: bool = True
    lifecycle: str = "active"

    def score(self, tags: Iterable[str]) -> float:
        if not tags:
            return self.priority
        intersection = self.skill_tags.intersection(t.lower() for t in tags)
        if not intersection:
            return self.priority * 0.5
        bonus = sum(self.capability_matrix.get(tag, 1.0) for tag in intersection)
        return self.priority + float(len(intersection)) * 2.0 + bonus

    def manifest_summary(self) -> str:
        parts = [f"manifest={self.manifest_uri}"]
        if self.subgraph:
            parts.append(f"subgraph={self.subgraph}")
        if self.l2_gateway:
            parts.append(f"l2={self.l2_gateway}")
        if self.oracle:
            parts.append(f"oracle={self.oracle}")
        return ", ".join(parts)

    def operations_summary(self) -> str:
        return (
            f"maxActive={self.max_active_jobs} queue={self.max_queue_depth} "
            f"minStake={self.min_stake} base-units (asset/decimals unverified) treasuryShare={self.treasury_share_bps / 100:.2f}% "
            f"circuitBreaker={self.circuit_breaker_bps / 100:.2f}% humanValidation={'yes' if self.requires_human_validation else 'no'}"
        )


@dataclass(slots=True)
class GlobalControls:
    iot_oracle_router: Optional[str] = None
    default_l2_gateway: Optional[str] = None
    did_registry: Optional[str] = None
    treasury_bridge: Optional[str] = None
    l2_sync_cadence: float = 120.0
    manifest_uri: Optional[str] = None
    system_pause: Optional[str] = None
    escalation_bridge: Optional[str] = None
    treasury_buffer_bps: int = 0
    circuit_breaker_bps: int = 0
    anomaly_grace_period: float = 0.0
    auto_pause_enabled: bool = False
    oversight_council: Optional[str] = None
    decentralized_infra: List[Dict[str, str]] = field(default_factory=list)
    telemetry_manifest_hash: Optional[str] = None
    telemetry_metrics_digest: Optional[str] = None
    telemetry_resilience_floor_bps: int = 0
    telemetry_automation_floor_bps: int = 0
    telemetry_oversight_weight_bps: int = 0
    credential_trust_anchors: List[Dict[str, str]] = field(default_factory=list)
    credential_issuers: List[Dict[str, object]] = field(default_factory=list)
    credential_policies: List[Dict[str, str]] = field(default_factory=list)
    credential_revocation_registry: Optional[str] = None


class DomainExpansionRuntime:
    """Helper powering Phase 6 routing decisions inside the orchestrator."""

    def __init__(
        self,
        domains: Sequence[DomainProfile],
        global_controls: GlobalControls,
        source: Optional[Path] = None,
    ) -> None:
        slugs = [profile.slug.strip().lower() for profile in domains]
        if len(slugs) != len(set(slugs)):
            raise ValueError("domain slugs must be unique (case-insensitive)")
        self._domains: Dict[str, DomainProfile] = dict(zip(slugs, deepcopy(domains)))
        self._global = deepcopy(global_controls)
        self._source = source
        self._loaded_at = time.time()
        _LOG.debug("Loaded %s Phase 6 domains from %s", len(domains), source or "<in-memory>")

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_payload(cls, payload: Dict[str, object], source: Optional[Path] = None) -> "DomainExpansionRuntime":
        payload = _keys(payload, {"scenario", "global", "domains"}, "configuration")
        if "scenario" in payload:
            scenario = _keys(payload["scenario"], {"mode", "description"}, "scenario")
            if _text(scenario.get("mode"), "scenario.mode", required=True) not in {"illustrative", "operator-supplied"}:
                raise ValueError("scenario.mode must be illustrative or operator-supplied")
            _text(scenario.get("description"), "scenario.description", required=True)
        domains_payload = payload.get("domains", [])
        if not isinstance(domains_payload, list):
            raise ValueError("domains payload must be an array")
        domains: List[DomainProfile] = []
        for entry in domains_payload:
            entry = _keys(entry, {
                "slug", "active", "lifecycle", "name", "manifestURI", "manifestUri", "subgraph",
                "validationModule", "oracle", "l2Gateway", "executionRouter", "heartbeatSeconds",
                "operations", "telemetry", "skillTags", "capabilities", "priority", "metadata",
                "infrastructure", "infrastructureControl", "credentials", "sunsetPlan",
            }, "domain")
            if "validationModule" in entry and _normalize_address(entry["validationModule"]) is None:
                raise ValueError("domain.validationModule must be a non-zero Ethereum address")
            if "infrastructureControl" in entry:
                _validate_infrastructure_control(entry["infrastructureControl"], "domain.infrastructureControl")
            if "sunsetPlan" in entry:
                _validate_sunset_plan(entry["sunsetPlan"])
            slug = _text(entry.get("slug", ""), "domain.slug", required=True)
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
                raise ValueError("domain.slug must use lowercase letters, numbers and single hyphens")
            metadata = _object(entry.get("metadata", {}), f"domain {slug} metadata")
            resilience = _number(metadata.get("resilienceIndex", 0), f"domain {slug} resilienceIndex", maximum=1)
            value_flow_usd = (
                _number(metadata["valueFlowMonthlyUSD"], f"domain {slug} valueFlowMonthlyUSD")
                if "valueFlowMonthlyUSD" in metadata else None
            )
            value_flow_display_raw = metadata.get("valueFlowDisplay")
            value_flow_display = _optional_text(value_flow_display_raw, f"domain {slug} valueFlowDisplay")
            uptime_raw = metadata.get("uptime")
            uptime = _optional_text(uptime_raw, f"domain {slug} uptime")
            sentinel_raw = metadata.get("sentinel")
            sentinel = _optional_text(sentinel_raw, f"domain {slug} sentinel")
            infrastructure = _normalize_infrastructure(
                entry.get("infrastructure"),
                f"domain {slug}",
                require_layer=True,
            )
            credentials = _normalize_credentials(entry.get("credentials"), f"domain {slug}")
            operations_payload = _keys(entry.get("operations", {}), {
                "maxActiveJobs", "maxQueueDepth", "minStake", "treasuryShareBps",
                "circuitBreakerBps", "requiresHumanValidation",
            }, f"domain {slug} operations")
            telemetry_payload = _keys(entry.get("telemetry", {}), {
                "resilienceBps", "automationBps", "complianceBps", "settlementLatencySeconds",
                "usesL2Settlement", "sentinelOracle", "settlementAsset", "metricsDigest", "manifestHash",
            }, f"domain {slug} telemetry")
            min_stake = _integer(operations_payload.get("minStake", "0"), f"domain {slug} minStake", maximum=2**96 - 1, allow_string=True)
            capabilities = _object(entry.get("capabilities", {}), f"domain {slug} capabilities")
            capability_matrix = {}
            for key, value in capabilities.items():
                tag = _text(key, f"domain {slug} capability name", required=True).lower()
                if tag in capability_matrix:
                    raise ValueError(f"domain {slug} capability names must be unique (case-insensitive)")
                capability_matrix[tag] = _number(value, f"domain {slug} capability {tag}")
            profile = DomainProfile(
                slug=slug.lower(),
                name=_text(entry.get("name", slug), f"domain {slug} name", required=True),
                manifest_uri=_text(entry.get("manifestURI", entry.get("manifestUri", "")), f"domain {slug} manifestURI", required=True),
                subgraph=_text(entry.get("subgraph", ""), f"domain {slug} subgraph"),
                l2_gateway=_normalize_address(entry.get("l2Gateway")),
                oracle=_normalize_address(entry.get("oracle")),
                execution_router=_normalize_address(entry.get("executionRouter")),
                heartbeat_seconds=_integer(entry.get("heartbeatSeconds", 120), f"domain {slug} heartbeatSeconds", minimum=30),
                skill_tags={tag.lower() for tag in _string_list(entry.get("skillTags", []), f"domain {slug} skillTags")},
                capability_matrix=capability_matrix,
                priority=_number(entry.get("priority", 0), f"domain {slug} priority"),
                metadata=metadata,
                resilience_index=resilience,
                value_flow_usd=value_flow_usd,
                value_flow_display=value_flow_display,
                uptime=uptime,
                sentinel=sentinel,
                infrastructure=infrastructure,
                max_active_jobs=_integer(operations_payload.get("maxActiveJobs", 0), f"domain {slug} maxActiveJobs", maximum=2**48 - 1),
                max_queue_depth=_integer(operations_payload.get("maxQueueDepth", 0), f"domain {slug} maxQueueDepth", maximum=2**48 - 1),
                min_stake=min_stake,
                treasury_share_bps=_integer(operations_payload.get("treasuryShareBps", 0), f"domain {slug} treasuryShareBps", maximum=10000),
                circuit_breaker_bps=_integer(operations_payload.get("circuitBreakerBps", 0), f"domain {slug} circuitBreakerBps", maximum=10000),
                requires_human_validation=_boolean(operations_payload.get("requiresHumanValidation", False), f"domain {slug} requiresHumanValidation"),
                telemetry_resilience_bps=_integer(telemetry_payload.get("resilienceBps", 0), f"domain {slug} resilienceBps", maximum=10000),
                telemetry_automation_bps=_integer(telemetry_payload.get("automationBps", 0), f"domain {slug} automationBps", maximum=10000),
                telemetry_compliance_bps=_integer(telemetry_payload.get("complianceBps", 0), f"domain {slug} complianceBps", maximum=10000),
                settlement_latency_seconds=float(_integer(telemetry_payload.get("settlementLatencySeconds", 0), f"domain {slug} settlementLatencySeconds", maximum=2**32 - 1)),
                uses_l2_settlement=_boolean(telemetry_payload.get("usesL2Settlement", False), f"domain {slug} usesL2Settlement"),
                sentinel_oracle=_normalize_address(telemetry_payload.get("sentinelOracle")),
                settlement_asset=_normalize_address(telemetry_payload.get("settlementAsset")),
                telemetry_metrics_digest=_normalize_bytes32(telemetry_payload.get("metricsDigest")),
                telemetry_manifest_hash=_normalize_bytes32(telemetry_payload.get("manifestHash")),
                credentials=credentials,
                active=_boolean(entry.get("active", True), f"domain {slug} active"),
                lifecycle=_lifecycle(entry.get("lifecycle", "active")),
            )
            domains.append(profile)
        global_payload = _keys(payload.get("global", {}), {
            "manifestURI", "manifestUri", "iotOracleRouter", "defaultL2Gateway", "didRegistry",
            "treasuryBridge", "systemPause", "escalationBridge", "l2SyncCadence", "guards",
            "decentralizedInfra", "credentials", "telemetry", "infrastructure",
        }, "global")
        for key in ("systemPause", "escalationBridge"):
            if key in global_payload and _normalize_address(global_payload[key]) is None:
                raise ValueError(f"global.{key} must be a non-zero Ethereum address")
        guards_payload = _keys(global_payload.get("guards", {}), {
            "treasuryBufferBps", "circuitBreakerBps", "anomalyGracePeriod", "autoPauseEnabled", "oversightCouncil",
        }, "global.guards")
        if "infrastructure" in global_payload:
            _validate_infrastructure_control(global_payload["infrastructure"], "global.infrastructure", global_control=True)
        global_infra = _normalize_infrastructure(global_payload.get("decentralizedInfra"), "global", require_layer=False)
        telemetry_payload = _keys(global_payload.get("telemetry", {}), {
            "manifestHash", "metricsDigest", "resilienceFloorBps", "automationFloorBps", "oversightWeightBps",
        }, "global.telemetry")
        _keys(global_payload.get("credentials", {}), {
            "trustAnchors", "issuers", "policies", "revocationRegistry",
        }, "global.credentials")
        controls = GlobalControls(
            iot_oracle_router=_normalize_address(global_payload.get("iotOracleRouter")),
            default_l2_gateway=_normalize_address(global_payload.get("defaultL2Gateway")),
            did_registry=_normalize_address(global_payload.get("didRegistry")),
            treasury_bridge=_normalize_address(global_payload.get("treasuryBridge")),
            l2_sync_cadence=_global_cadence(global_payload.get("l2SyncCadence", 120)),
            manifest_uri=_optional_text(global_payload.get("manifestURI", global_payload.get("manifestUri")), "global.manifestURI"),
            system_pause=_normalize_address(global_payload.get("systemPause")),
            escalation_bridge=_normalize_address(global_payload.get("escalationBridge")),
            treasury_buffer_bps=_integer(guards_payload.get("treasuryBufferBps", 0), "global.guards.treasuryBufferBps", maximum=10000),
            circuit_breaker_bps=_integer(guards_payload.get("circuitBreakerBps", 0), "global.guards.circuitBreakerBps", maximum=10000),
            anomaly_grace_period=_integer(guards_payload.get("anomalyGracePeriod", 0), "global.guards.anomalyGracePeriod", maximum=2**32 - 1),
            auto_pause_enabled=_boolean(guards_payload.get("autoPauseEnabled", False), "global.guards.autoPauseEnabled"),
            oversight_council=_normalize_address(guards_payload.get("oversightCouncil")),
            decentralized_infra=global_infra,
            telemetry_manifest_hash=_normalize_bytes32(telemetry_payload.get("manifestHash")),
            telemetry_metrics_digest=_normalize_bytes32(telemetry_payload.get("metricsDigest")),
            telemetry_resilience_floor_bps=_integer(telemetry_payload.get("resilienceFloorBps", 0), "global.telemetry.resilienceFloorBps", maximum=10000),
            telemetry_automation_floor_bps=_integer(telemetry_payload.get("automationFloorBps", 0), "global.telemetry.automationFloorBps", maximum=10000),
            telemetry_oversight_weight_bps=_integer(telemetry_payload.get("oversightWeightBps", 0), "global.telemetry.oversightWeightBps", maximum=10000),
            credential_trust_anchors=_normalize_trust_anchors(global_payload.get("credentials")),
            credential_issuers=_normalize_credential_issuers(global_payload.get("credentials")),
            credential_policies=_normalize_credential_policies(global_payload.get("credentials")),
            credential_revocation_registry=_normalize_revocation_registry(global_payload.get("credentials")),
        )
        return cls(domains, controls, source=source)

    @classmethod
    def from_file(cls, path: Path) -> "DomainExpansionRuntime":
        payload = json.loads(path.read_text("utf-8"), object_pairs_hook=_unique_object, parse_constant=_reject_constant)
        return cls.from_payload(payload, source=path)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def loaded_at(self) -> float:
        return self._loaded_at

    @property
    def source(self) -> Optional[Path]:
        return self._source

    @property
    def domains(self) -> Sequence[DomainProfile]:
        return deepcopy(list(self._domains.values()))

    @property
    def global_infrastructure(self) -> Sequence[Dict[str, str]]:
        return deepcopy(self._global.decentralized_infra)

    def annotate_step(self, step: "Step") -> List[str]:
        if not self._domains:
            return []
        domain_hint, tags = _extract_domain_hint(step)
        requirements = _routing_requirements(step.params, "step.params")
        profile, score, matched_tags = self._select_profile(domain_hint, tags, *requirements)
        if not profile:
            if domain_hint:
                return [
                    f"Phase6 runtime: domain `{domain_hint}` not found, inactive, not commissioned or missing required capabilities in configuration from {self._source}",
                ]
            return ["Phase6 runtime: no eligible domain found for current step."]
        logs = [
            f"Phase6 runtime candidate `{profile.slug}` — {profile.name} (score={score:.2f}).",
            "• planning metadata only; authorization, credentials, provider execution and settlement are unverified.",
            f"• manifest: {profile.manifest_summary()}",
        ]
        if tags:
            matched = sorted(matched_tags)
            logs.append(f"• matched tags: {', '.join(matched) if matched else 'none'}")
        heartbeat = max(profile.heartbeat_seconds, self._global.l2_sync_cadence)
        logs.append(f"• heartbeat: {heartbeat:.0f}s (domain {profile.heartbeat_seconds:.0f}s, global {self._global.l2_sync_cadence:.0f}s)")
        if profile.execution_router:
            logs.append(f"• execution router: {profile.execution_router}")
        if self._global.iot_oracle_router:
            logs.append(f"• IoT oracle router: {self._global.iot_oracle_router}")
        if self._global.manifest_uri:
            logs.append(f"• global manifest: {self._global.manifest_uri}")
        if self._global.system_pause or self._global.escalation_bridge:
            logs.append(
                "• emergency levers: pause="
                f"{self._global.system_pause or '—'} / escalation={self._global.escalation_bridge or '—'}"
            )
        if self._global.credential_trust_anchors:
            anchor_preview = ", ".join(
                anchor.get("name", "anchor") for anchor in self._global.credential_trust_anchors[:2]
            )
            if len(self._global.credential_trust_anchors) > 2:
                anchor_preview += ", …"
            logs.append(f"• trust anchors: {anchor_preview}")
        if (
            self._global.treasury_buffer_bps
            or self._global.circuit_breaker_bps
            or self._global.anomaly_grace_period
        ):
            logs.append(
                "• guard rails: "
                f"treasuryBuffer={self._global.treasury_buffer_bps / 100:.2f}% "
                f"circuitBreaker={self._global.circuit_breaker_bps / 100:.2f}% "
                f"grace={self._global.anomaly_grace_period:.0f}s "
                f"autoPause={'on' if self._global.auto_pause_enabled else 'off'}"
            )
        if self._global.oversight_council:
            logs.append(f"• oversight council: {self._global.oversight_council}")
        if self._global.telemetry_resilience_floor_bps:
            logs.append(
                "• telemetry floors: "
                f"resilience {self._global.telemetry_resilience_floor_bps / 100:.2f}% "
                f"automation {self._global.telemetry_automation_floor_bps / 100:.2f}% "
                f"oversight {self._global.telemetry_oversight_weight_bps / 100:.2f}%"
            )
        if self._global.telemetry_manifest_hash or self._global.telemetry_metrics_digest:
            logs.append(
                "• telemetry manifests: "
                f"manifest={self._global.telemetry_manifest_hash or '—'} "
                f"metrics={self._global.telemetry_metrics_digest or '—'}"
            )
        if self._global.decentralized_infra:
            preview = ", ".join(
                f"{item.get('name', 'mesh')}({item.get('status', '-')})"
                for item in self._global.decentralized_infra[:2]
            )
            if len(self._global.decentralized_infra) > 2:
                preview += ", …"
            logs.append(f"• global infra mesh: {preview}")
        if profile.resilience_index:
            logs.append(f"• resilience index: {profile.resilience_index:.3f}")
        if profile.telemetry_resilience_bps or profile.telemetry_automation_bps:
            logs.append(
                "• telemetry: "
                f"resilience {profile.telemetry_resilience_bps / 100:.2f}% "
                f"automation {profile.telemetry_automation_bps / 100:.2f}% "
                f"compliance {profile.telemetry_compliance_bps / 100:.2f}%"
            )
        if profile.settlement_latency_seconds:
            settlement_hint = (
                f"{profile.settlement_latency_seconds:.0f}s"
                if profile.settlement_latency_seconds.is_integer()
                else f"{profile.settlement_latency_seconds:.1f}s"
            )
            logs.append(
                "• settlement cadence: "
                f"{settlement_hint} / L2={'yes' if profile.uses_l2_settlement else 'no'}"
            )
        if profile.value_flow_display or profile.value_flow_usd is not None:
            display = profile.value_flow_display
            if not display and profile.value_flow_usd is not None:
                display = f"${profile.value_flow_usd:,.0f}"
            logs.append(f"• configured monthly value-flow scenario (unverified): {display}")
        if profile.uptime:
            logs.append(f"• configured uptime (unverified): {profile.uptime}")
        if profile.sentinel:
            logs.append(f"• sentinel: {profile.sentinel}")
        if profile.sentinel_oracle:
            logs.append(f"• sentinel oracle: {profile.sentinel_oracle}")
        if profile.infrastructure:
            preview = ", ".join(
                f"{item.get('layer', 'layer')}:{item.get('name', 'service')}({item.get('status', '-')})"
                for item in profile.infrastructure[:3]
            )
            logs.append(f"• infra mesh: {preview}")
        if profile.credentials:
            credential_preview = ", ".join(
                cred.get("name", "credential") for cred in profile.credentials[:2]
            )
            if len(profile.credentials) > 2:
                credential_preview += ", …"
            logs.append(f"• credential guard rails: {credential_preview}")
        logs.append(f"• operations: {profile.operations_summary()}")
        return logs

    def build_bridge_plan(self, slug: str) -> Dict[str, object]:
        profile = self._domains.get(_text(slug, "domain", required=True).lower())
        if not profile:
            raise KeyError(f"Unknown domain: {slug}")
        if not profile.active or profile.lifecycle != "active":
            raise ValueError(f"Domain is inactive or not commissioned as active: {slug}")
        cadence = max(profile.heartbeat_seconds, self._global.l2_sync_cadence)
        return {
            "status": "planning-only",
            "authorizationVerified": False,
            "credentialsVerified": False,
            "settlementReady": False,
            "domain": profile.slug,
            "lifecycle": profile.lifecycle,
            "l2Gateway": profile.l2_gateway or self._global.default_l2_gateway,
            "iotOracle": profile.oracle or self._global.iot_oracle_router,
            "executionRouter": profile.execution_router,
            "syncCadenceSeconds": cadence,
            "manifest": profile.manifest_uri,
            "subgraph": profile.subgraph,
            "resilienceIndex": profile.resilience_index,
            "sentinel": profile.sentinel,
            "uptime": profile.uptime,
            "valueFlowMonthlyUSD": profile.value_flow_usd,
            "infrastructure": deepcopy(profile.infrastructure),
            "globalInfrastructure": self.global_infrastructure,
            "maxActiveJobs": profile.max_active_jobs,
            "maxQueueDepth": profile.max_queue_depth,
            "minStake": str(profile.min_stake),
            "treasuryShareBps": profile.treasury_share_bps,
            "circuitBreakerBps": profile.circuit_breaker_bps,
            "requiresHumanValidation": profile.requires_human_validation,
            "telemetry": {
                "resilienceBps": profile.telemetry_resilience_bps,
                "automationBps": profile.telemetry_automation_bps,
                "complianceBps": profile.telemetry_compliance_bps,
                "settlementLatencySeconds": profile.settlement_latency_seconds,
                "usesL2Settlement": profile.uses_l2_settlement,
                "sentinelOracle": profile.sentinel_oracle,
                "settlementAsset": profile.settlement_asset,
                "metricsDigest": profile.telemetry_metrics_digest,
                "manifestHash": profile.telemetry_manifest_hash,
            },
            "credentials": deepcopy(profile.credentials),
        }

    def ingest_iot_signal(self, signal: Dict[str, object]) -> Tuple[str, List[str]]:
        signal = _object(signal, "IoT signal")
        hints = {
            hint.lower() for key in ("domain", "domainHint")
            if (hint := _optional_text(signal.get(key), f"IoT signal {key}"))
        }
        if len(hints) > 1:
            raise ValueError("IoT signal contains conflicting domain hints")
        domain_hint = next(iter(hints), None)
        tags = _string_list(signal.get("tags", []), "IoT signal tags")
        requirements = _routing_requirements(signal, "IoT signal")
        profile, _, resolved_tags = self._select_profile(domain_hint, tags, *requirements)
        if profile is None:
            raise ValueError("IoT signal has no eligible configured domain")
        slug = profile.slug
        logs = [
            f"Phase6 runtime inspected unverified IoT signal for `{slug}`",
            "• observation only; no oracle signature, freshness or execution authorization verified.",
        ]
        if resolved_tags:
            logs.append(f"• matched {', '.join(sorted(resolved_tags))}")
        if slug and slug in self._domains:
            profile = self._domains[slug]
            if profile.sentinel:
                logs.append(f"• sentinel on watch: {profile.sentinel}")
            if profile.resilience_index:
                logs.append(f"• resilience index: {profile.resilience_index:.3f}")
            if profile.telemetry_resilience_bps or profile.telemetry_automation_bps:
                logs.append(
                    "• telemetry: "
                    f"resilience {profile.telemetry_resilience_bps / 100:.2f}% "
                    f"automation {profile.telemetry_automation_bps / 100:.2f}% "
                    f"compliance {profile.telemetry_compliance_bps / 100:.2f}%"
                )
            if profile.infrastructure:
                primary = profile.infrastructure[0]
                logs.append(
                    "• primary infra: "
                    f"{primary.get('layer', 'layer')} / {primary.get('name', 'service')} ({primary.get('status', '-')})"
                )
            if profile.settlement_latency_seconds:
                logs.append(
                    "• settlement latency: "
                    f"{profile.settlement_latency_seconds:.1f}s | L2={'yes' if profile.uses_l2_settlement else 'no'}"
                )
            logs.append(f"• operations: {profile.operations_summary()}")
            if profile.credentials:
                cred_names = ", ".join(
                    credential.get("name", "credential") for credential in profile.credentials[:2]
                )
                logs.append(f"• credentials in scope: {cred_names}")
        elif self._global.decentralized_infra:
            primary = self._global.decentralized_infra[0]
            mesh_hint = " / ".join(
                filter(
                    None,
                    (
                        primary.get("layer"),
                        primary.get("name"),
                    ),
                )
            )
            logs.append(
                "• global infra mesh ready: "
                f"{mesh_hint or primary.get('name', 'mesh')} ({primary.get('status', '-')})"
            )
        return slug, logs

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _select_profile(
        self,
        domain_hint: Optional[str],
        tags: Iterable[str],
        required_skills: Optional[Set[str]] = None,
        required_capabilities: Optional[Dict[str, float]] = None,
        requires_human: bool = False,
    ) -> Tuple[Optional[DomainProfile], float, Set[str]]:
        normalized_tags = {tag.strip().lower() for tag in tags if isinstance(tag, str) and tag.strip()}
        required_skills = required_skills or set()
        required_capabilities = required_capabilities or {}
        normalized_tags.update(required_skills)
        if not domain_hint and not normalized_tags and not required_capabilities:
            return None, float("nan"), set()

        def eligible(profile: DomainProfile) -> bool:
            return (
                profile.active
                and profile.lifecycle == "active"
                and required_skills.issubset(profile.skill_tags)
                and all(profile.capability_matrix.get(tag, 0) >= minimum for tag, minimum in required_capabilities.items())
                and (not requires_human or profile.requires_human_validation)
            )

        if domain_hint:
            profile = self._domains.get(domain_hint.strip().lower())
            if profile and eligible(profile):
                return profile, profile.score(normalized_tags), normalized_tags.intersection(profile.skill_tags)
            return None, float("nan"), set()
        best_score = -math.inf
        best_profile: Optional[DomainProfile] = None
        for profile in self._domains.values():
            # A priority is a ranking preference, never evidence of an unrelated skill.
            if not eligible(profile) or (normalized_tags and not normalized_tags.intersection(profile.skill_tags)):
                continue
            score = profile.score(normalized_tags)
            if score > best_score:
                best_score = score
                best_profile = profile
        if best_profile is None:
            return None, float("nan"), set()
        return best_profile, best_score, normalized_tags.intersection(best_profile.skill_tags)


def _lifecycle(value: object) -> str:
    lifecycle = _text(value, "domain.lifecycle", required=True)
    if lifecycle not in {"active", "experimental", "sunset"}:
        raise ValueError("domain.lifecycle must be active, experimental or sunset")
    return lifecycle


def _global_cadence(value: object) -> int:
    cadence = _integer(value, "global.l2SyncCadence")
    if 0 < cadence < 30:
        raise ValueError("global.l2SyncCadence must be zero or at least 30 seconds")
    return cadence


def _routing_requirements(payload: Dict[str, object], context: str) -> Tuple[Set[str], Dict[str, float], bool]:
    skills = {tag.lower() for tag in _string_list(payload.get("requiredSkills", []), f"{context}.requiredSkills")}
    capabilities = {}
    for key, value in _object(payload.get("requiredCapabilities", {}), f"{context}.requiredCapabilities").items():
        tag = _text(key, f"{context}.requiredCapabilities key", required=True).lower()
        minimum = _number(value, f"{context}.requiredCapabilities.{tag}")
        if minimum == 0 or tag in capabilities:
            raise ValueError(f"{context}.requiredCapabilities must have positive values and unique normalized keys")
        capabilities[tag] = minimum
    metadata = _object(payload.get("metadata", {}), f"{context}.metadata")
    requires_human = _boolean(metadata.get("requiresHumanInLoop", False), f"{context}.metadata.requiresHumanInLoop")
    if "requiresHumanInLoop" in payload:
        requires_human = _boolean(payload["requiresHumanInLoop"], f"{context}.requiresHumanInLoop") or requires_human
    return skills, capabilities, requires_human


def _object(value: object, context: str) -> Dict[str, object]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise ValueError(f"{context} must be an object with string keys")
    return value


def _keys(value: object, allowed: Set[str], context: str) -> Dict[str, object]:
    result = _object(value, context)
    unknown = set(result) - allowed
    if unknown:
        raise ValueError(f"{context} has unsupported configuration fields: {', '.join(sorted(unknown))}")
    return result


def _validate_infrastructure_control(value: object, context: str, *, global_control: bool = False) -> None:
    address_fields = (
        {"meshCoordinator", "dataLake", "identityBridge"} if global_control
        else {"agentOps", "dataPipeline", "credentialVerifier", "fallbackOperator"}
    )
    uri_field = "topologyURI" if global_control else "controlPlaneURI"
    flag_field = "enforceDecentralizedInfra" if global_control else "autopilotEnabled"
    control = _keys(value, address_fields | {uri_field, flag_field, "autopilotCadence"}, context)
    _text(control.get(uri_field), f"{context}.{uri_field}", required=True)
    for key in address_fields:
        if key in control:
            _normalize_address(control[key])
    cadence = _integer(control.get("autopilotCadence", 0), f"{context}.autopilotCadence")
    if 0 < cadence < 30:
        raise ValueError(f"{context}.autopilotCadence must be zero or at least 30 seconds")
    enabled = _boolean(control.get(flag_field, False), f"{context}.{flag_field}")
    if not global_control and enabled and not cadence:
        raise ValueError(f"{context}.autopilotCadence must be at least 30 seconds when enabled")


def _validate_sunset_plan(value: object) -> None:
    plan = _keys(value, {"reason", "retirementBlock", "handoffDomains", "notes"}, "domain.sunsetPlan")
    for key in ("reason", "notes"):
        if key in plan:
            _text(plan[key], f"domain.sunsetPlan.{key}", required=True)
    if "retirementBlock" in plan:
        _integer(plan["retirementBlock"], "domain.sunsetPlan.retirementBlock", minimum=1)
    if "handoffDomains" in plan:
        _string_list(plan["handoffDomains"], "domain.sunsetPlan.handoffDomains")


def _text(value: object, context: str, *, required: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{context} must be a string")
    result = value.strip()
    if required and not result:
        raise ValueError(f"{context} is required")
    if any(ord(char) < 32 or ord(char) == 127 for char in result):
        raise ValueError(f"{context} must not contain control characters")
    return result


def _optional_text(value: object, context: str) -> Optional[str]:
    return None if value is None else (_text(value, context) or None)


def _string_list(value: object, context: str) -> List[str]:
    if not isinstance(value, (list, tuple)):
        raise ValueError(f"{context} must be an array of strings")
    return [_text(item, f"{context}[{index}]", required=True) for index, item in enumerate(value)]


def _boolean(value: object, context: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{context} must be a boolean")
    return value


def _number(value: object, context: str, *, maximum: Optional[float] = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{context} must be a finite non-negative number")
    try:
        result = float(value)
    except OverflowError as exc:
        raise ValueError(f"{context} must be finite") from exc
    if not math.isfinite(result) or result < 0 or (maximum is not None and result > maximum):
        raise ValueError(f"{context} must be finite and within range")
    return result


def _integer(
    value: object,
    context: str,
    *,
    minimum: int = 0,
    maximum: int = 2**64 - 1,
    allow_string: bool = False,
) -> int:
    decimal_string = bool(allow_string and isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]*", value))
    if decimal_string:
        value = int(value)
    # JSON 30.0 and 3e1 have integer semantics in the TypeScript consumer too.
    # Conversion is safe only before binary64 integer precision is exhausted.
    if isinstance(value, float) and math.isfinite(value) and value.is_integer() and abs(value) <= 2**53 - 1:
        value = int(value)
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or (not decimal_string and abs(value) > 2**53 - 1)
        or not minimum <= value <= maximum
    ):
        raise ValueError(f"{context} must be an exact integer between {minimum} and {maximum}; numeric values must be safe integers")
    return value


def _object_list(value: object, context: str) -> List[Dict[str, object]]:
    if not isinstance(value, list):
        raise ValueError(f"{context} must be an array of objects")
    return [_object(item, f"{context}[{index}]") for index, item in enumerate(value)]


def _normalize_infrastructure(payload: object, context: str, *, require_layer: bool) -> List[Dict[str, str]]:
    if payload is None:
        return []
    result = []
    for index, item in enumerate(_object_list(payload, f"{context} infrastructure")):
        label = f"{context} infrastructure[{index}]"
        _keys(item, {"layer", "name", "role", "status", "provider", "endpoint", "uri"}, label)
        entry = {key: _text(item.get(key, ""), f"{label}.{key}", required=True) for key in ("name", "role", "status")}
        layer = _text(item.get("layer", ""), f"{label}.layer", required=require_layer)
        if layer:
            entry["layer"] = layer
        for key, value in (("provider", item.get("provider")), ("endpoint", item.get("endpoint", item.get("uri")))):
            text = _optional_text(value, f"{label}.{key}")
            if text:
                entry[key] = text
        result.append(entry)
    return result


def _normalize_credentials(payload: object, context: str) -> List[Dict[str, object]]:
    if payload is None:
        return []
    result = []
    for index, item in enumerate(_object_list(payload, f"{context} credentials")):
        label = f"{context} credentials[{index}]"
        _keys(item, {"name", "requirement", "credentialType", "format", "registry", "evidence", "issuers", "verifiers", "notes"}, label)
        entry: Dict[str, object] = {
            key: _text(item.get(key, ""), f"{label}.{key}", required=True)
            for key in ("name", "requirement", "credentialType", "format", "registry", "evidence")
        }
        for key in ("issuers", "verifiers"):
            entry[key] = _string_list(item.get(key), f"{label}.{key}")
        notes = _optional_text(item.get("notes"), f"{label}.notes")
        if notes:
            entry["notes"] = notes
        result.append(entry)
    return result


def _credential_entries(payload: object, field: str) -> List[Dict[str, object]]:
    if payload is None:
        return []
    credentials = _object(payload, "global.credentials")
    return _object_list(credentials.get(field, []), f"global.credentials.{field}")


def _normalize_trust_anchors(payload: object) -> List[Dict[str, str]]:
    result = []
    for index, item in enumerate(_credential_entries(payload, "trustAnchors")):
        label = f"global.credentials.trustAnchors[{index}]"
        _keys(item, {"name", "did", "role", "policyURI", "policyUri"}, label)
        entry = {key: _text(item.get(key, ""), f"{label}.{key}", required=True) for key in ("name", "did", "role")}
        policy_uri = _optional_text(item.get("policyURI", item.get("policyUri")), f"{label}.policyURI")
        if policy_uri:
            entry["policyURI"] = policy_uri
        result.append(entry)
    return result


def _normalize_credential_issuers(payload: object) -> List[Dict[str, object]]:
    result = []
    for index, item in enumerate(_credential_entries(payload, "issuers")):
        label = f"global.credentials.issuers[{index}]"
        _keys(item, {"name", "did", "attestationType", "registry", "domains"}, label)
        entry: Dict[str, object] = {
            key: _text(item.get(key, ""), f"{label}.{key}", required=True)
            for key in ("name", "did", "attestationType", "registry")
        }
        entry["domains"] = _string_list(item.get("domains", []), f"{label}.domains")
        result.append(entry)
    return result


def _normalize_credential_policies(payload: object) -> List[Dict[str, str]]:
    result = []
    for index, item in enumerate(_credential_entries(payload, "policies")):
        label = f"global.credentials.policies[{index}]"
        _keys(item, {"name", "description", "uri"}, label)
        entry = {key: _text(item.get(key, ""), f"{label}.{key}", required=True) for key in ("name", "description", "uri")}
        result.append(entry)
    return result


def _normalize_revocation_registry(payload: object) -> Optional[str]:
    if payload is None:
        return None
    return _optional_text(_object(payload, "global.credentials").get("revocationRegistry"), "global.credentials.revocationRegistry")


def _normalize_bytes32(value: object) -> Optional[str]:
    text = _optional_text(value, "bytes32 value")
    if text is None:
        return None
    if not re.fullmatch(r"0x[0-9a-fA-F]{64}", text):
        raise ValueError("invalid bytes32 value")
    return None if text == _ZERO_BYTES32 else text.lower()


def _normalize_address(value: object) -> Optional[str]:
    text = _optional_text(value, "address")
    if text is None:
        return None
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", text):
        raise ValueError("invalid Ethereum address")
    return None if text == "0x" + "0" * 40 else text


def _unique_object(pairs: List[Tuple[str, object]]) -> Dict[str, object]:
    result: Dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate configuration key: {key}")
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON value: {value}")


def _extract_domain_hint(step: "Step") -> Tuple[Optional[str], Set[str]]:
    hints: Set[str] = set()
    tags: Set[str] = set()
    params = step.params if isinstance(step.params, dict) else {}
    for key in ("domain", "domainHint", "phase6Domain", "targetDomain", "industry"):
        if key in params:
            hint = _optional_text(params[key], f"step.params.{key}")
            if hint:
                hints.add(hint.lower())
    for key in ("tags", "skills", "capabilities", "industries"):
        if key in params:
            tags.update(_string_list(params[key], f"step.params.{key}"))
    metadata = step.metadata if isinstance(getattr(step, "metadata", None), dict) else {}
    hint = _optional_text(metadata.get("domain"), "step.metadata.domain")
    if hint:
        hints.add(hint.lower())
    if "tags" in metadata:
        tags.update(_string_list(metadata["tags"], "step.metadata.tags"))
    if len(hints) > 1:
        raise ValueError("step contains conflicting Phase 6 domain hints")
    return next(iter(hints), None), tags


def load_runtime(path: Optional[Path] = None) -> DomainExpansionRuntime:
    """Load an explicit override or the bundled configuration; missing files fail closed."""
    if path is None:
        override = os.environ.get("PHASE6_DOMAIN_CONFIG")
        path = Path(override) if override else _DEFAULT_CONFIG
    return DomainExpansionRuntime.from_file(path)
