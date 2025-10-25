"""Phase 6 expansion runtime helpers.

The runtime consumes on-chain domain configuration snapshots exported by the
Phase6ExpansionManager contract and provides rich annotations for the Python
orchestrator. Non-technical operators can point the orchestrator at a JSON file
exported from the subgraph and the runtime will route steps to the correct
specialist domain teams, surface audit metadata and generate bridge plans for
Layer-2 deployments.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple, TYPE_CHECKING

try:  # pragma: no cover - optional dependency for keccak
    from eth_hash.auto import keccak as _auto_keccak
except Exception:  # pragma: no cover - gracefully degrade if unavailable
    _auto_keccak = None

if TYPE_CHECKING:  # pragma: no cover - imported during type checking only
    from ..models import Step

_LOG = logging.getLogger(__name__)
_DEFAULT_CONFIG = Path("demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json")
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
        stake_eth = self.min_stake / 1e18 if self.min_stake else 0.0
        return (
            f"maxActive={self.max_active_jobs} queue={self.max_queue_depth} "
            f"minStake={stake_eth:.2f} ETH treasuryShare={self.treasury_share_bps / 100:.2f}% "
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


@dataclass(slots=True)
class RegistrySkill:
    key: str
    skill_id: str
    label: str
    metadata_uri: str
    requires_credential: bool
    active: bool


@dataclass(slots=True)
class RegistryAgent:
    address: str
    alias: str
    did: str
    manifest_hash: str
    credential_hash: Optional[str]
    skills: Set[str]
    approved: Optional[bool]
    active: Optional[bool]
    note: Optional[str]


@dataclass(slots=True)
class RegistryDomain:
    slug: str
    domain_id: str
    manifest_hash: str
    metadata_uri: str
    active: bool
    credential_requires: bool
    credential_attestor: Optional[str]
    credential_schema: Optional[str]
    credential_uri: Optional[str]
    skills: Dict[str, RegistrySkill] = field(default_factory=dict)
    agents: List[RegistryAgent] = field(default_factory=list)


class DomainExpansionRuntime:
    """Helper powering Phase 6 routing decisions inside the orchestrator."""

    def __init__(
        self,
        domains: Sequence[DomainProfile],
        global_controls: GlobalControls,
        source: Optional[Path] = None,
    ) -> None:
        self._domains: Dict[str, DomainProfile] = {profile.slug: profile for profile in domains}
        self._global = global_controls
        self._source = source
        self._loaded_at = time.time()
        self._registry_domains: Dict[str, RegistryDomain] = {}
        self._registry_manifest_hash: Optional[str] = None
        self._registry_contract: Optional[str] = None
        _LOG.debug("Loaded %s Phase 6 domains from %s", len(domains), source or "<in-memory>")

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_payload(cls, payload: Dict[str, object], source: Optional[Path] = None) -> "DomainExpansionRuntime":
        domains_payload = payload.get("domains", [])
        if not isinstance(domains_payload, list):
            raise ValueError("domains payload must be an array")
        domains: List[DomainProfile] = []
        for entry in domains_payload:
            if not isinstance(entry, dict):
                raise ValueError("domain entries must be objects")
            slug = str(entry.get("slug", "")).strip()
            if not slug:
                raise ValueError("domain.slug is required")
            metadata_raw = entry.get("metadata") or {}
            if metadata_raw and not isinstance(metadata_raw, dict):
                raise ValueError(f"domain {slug} metadata must be an object")
            metadata = {str(k): v for k, v in metadata_raw.items() if isinstance(k, str)}
            resilience = _parse_float(metadata.get("resilienceIndex")) or 0.0
            value_flow_usd = _parse_float(metadata.get("valueFlowMonthlyUSD"))
            value_flow_display_raw = metadata.get("valueFlowDisplay")
            value_flow_display = str(value_flow_display_raw) if value_flow_display_raw is not None else None
            uptime_raw = metadata.get("uptime")
            uptime = str(uptime_raw) if uptime_raw is not None else None
            sentinel_raw = metadata.get("sentinel")
            sentinel = str(sentinel_raw) if sentinel_raw is not None else None
            infrastructure = _normalize_infrastructure(
                entry.get("infrastructure"),
                f"domain {slug}",
                require_layer=True,
            )
            operations_payload = entry.get("operations") or {}
            if operations_payload and not isinstance(operations_payload, dict):
                raise ValueError(f"domain {slug} operations must be an object")
            telemetry_payload = entry.get("telemetry") or {}
            if telemetry_payload and not isinstance(telemetry_payload, dict):
                raise ValueError(f"domain {slug} telemetry must be an object")
            try:
                min_stake = int(str(operations_payload.get("minStake", "0")))
            except (ValueError, TypeError) as exc:
                raise ValueError(f"domain {slug} operations.minStake must be an integer-compatible string") from exc
            telemetry_resilience = int(float(telemetry_payload.get("resilienceBps", 0)))
            telemetry_automation = int(float(telemetry_payload.get("automationBps", 0)))
            telemetry_compliance = int(float(telemetry_payload.get("complianceBps", 0)))
            settlement_latency = float(telemetry_payload.get("settlementLatencySeconds", 0))
            uses_l2_settlement = bool(telemetry_payload.get("usesL2Settlement", False))
            profile = DomainProfile(
                slug=slug.lower(),
                name=str(entry.get("name", slug)).strip(),
                manifest_uri=str(entry.get("manifestURI", entry.get("manifestUri", ""))).strip(),
                subgraph=str(entry.get("subgraph", "")).strip(),
                l2_gateway=_normalize_address(entry.get("l2Gateway")),
                oracle=_normalize_address(entry.get("oracle")),
                execution_router=_normalize_address(entry.get("executionRouter")),
                heartbeat_seconds=float(entry.get("heartbeatSeconds", 120)),
                skill_tags={tag.lower() for tag in entry.get("skillTags", []) if isinstance(tag, str)},
                capability_matrix={k.lower(): float(v) for k, v in (entry.get("capabilities") or {}).items()},
                priority=float(entry.get("priority", 0)),
                metadata=metadata,
                resilience_index=resilience,
                value_flow_usd=value_flow_usd,
                value_flow_display=value_flow_display,
                uptime=uptime,
                sentinel=sentinel,
                infrastructure=infrastructure,
                max_active_jobs=int(operations_payload.get("maxActiveJobs", 0)),
                max_queue_depth=int(operations_payload.get("maxQueueDepth", 0)),
                min_stake=min_stake,
                treasury_share_bps=int(operations_payload.get("treasuryShareBps", 0)),
                circuit_breaker_bps=int(operations_payload.get("circuitBreakerBps", 0)),
                requires_human_validation=bool(operations_payload.get("requiresHumanValidation", False)),
                telemetry_resilience_bps=telemetry_resilience,
                telemetry_automation_bps=telemetry_automation,
                telemetry_compliance_bps=telemetry_compliance,
                settlement_latency_seconds=settlement_latency,
                uses_l2_settlement=uses_l2_settlement,
                sentinel_oracle=_normalize_address(telemetry_payload.get("sentinelOracle")),
                settlement_asset=_normalize_address(telemetry_payload.get("settlementAsset")),
                telemetry_metrics_digest=_normalize_bytes32(telemetry_payload.get("metricsDigest")),
                telemetry_manifest_hash=_normalize_bytes32(telemetry_payload.get("manifestHash")),
            )
            if not profile.manifest_uri:
                raise ValueError(f"domain {slug} missing manifestURI")
            domains.append(profile)
        global_payload = payload.get("global", {})
        if not isinstance(global_payload, dict):
            raise ValueError("global payload must be an object")
        guards_payload = global_payload.get("guards") or {}
        if guards_payload and not isinstance(guards_payload, dict):
            raise ValueError("global.guards must be an object")
        infra_payload = global_payload.get("decentralizedInfra")
        global_infra = _normalize_infrastructure(infra_payload, "global", require_layer=False)
        telemetry_payload = global_payload.get("telemetry") or {}
        if telemetry_payload and not isinstance(telemetry_payload, dict):
            raise ValueError("global.telemetry must be an object")
        controls = GlobalControls(
            iot_oracle_router=_normalize_address(global_payload.get("iotOracleRouter")),
            default_l2_gateway=_normalize_address(global_payload.get("defaultL2Gateway")),
            did_registry=_normalize_address(global_payload.get("didRegistry")),
            treasury_bridge=_normalize_address(global_payload.get("treasuryBridge")),
            l2_sync_cadence=float(global_payload.get("l2SyncCadence", 120)),
            manifest_uri=str(
                global_payload.get("manifestURI", global_payload.get("manifestUri", ""))
            ).strip()
            or None,
            system_pause=_normalize_address(global_payload.get("systemPause")),
            escalation_bridge=_normalize_address(global_payload.get("escalationBridge")),
            treasury_buffer_bps=int(guards_payload.get("treasuryBufferBps", 0)),
            circuit_breaker_bps=int(guards_payload.get("circuitBreakerBps", 0)),
            anomaly_grace_period=float(guards_payload.get("anomalyGracePeriod", 0)),
            auto_pause_enabled=bool(guards_payload.get("autoPauseEnabled", False)),
            oversight_council=_normalize_address(guards_payload.get("oversightCouncil")),
            decentralized_infra=global_infra,
            telemetry_manifest_hash=_normalize_bytes32(telemetry_payload.get("manifestHash")),
            telemetry_metrics_digest=_normalize_bytes32(telemetry_payload.get("metricsDigest")),
            telemetry_resilience_floor_bps=int(telemetry_payload.get("resilienceFloorBps", 0)),
            telemetry_automation_floor_bps=int(telemetry_payload.get("automationFloorBps", 0)),
            telemetry_oversight_weight_bps=int(telemetry_payload.get("oversightWeightBps", 0)),
        )
        registry_payload = payload.get("registry")
        runtime = cls(domains, controls, source=source)
        if registry_payload is not None:
            runtime._load_registry(registry_payload)
        return runtime

    @classmethod
    def from_file(cls, path: Path) -> "DomainExpansionRuntime":
        payload = json.loads(path.read_text("utf-8"))
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
        return list(self._domains.values())

    @property
    def global_infrastructure(self) -> Sequence[Dict[str, str]]:
        return list(self._global.decentralized_infra)

    @property
    def registry_manifest(self) -> Optional[str]:
        return self._registry_manifest_hash

    @property
    def registry_contract(self) -> Optional[str]:
        return self._registry_contract

    @property
    def registry_domains(self) -> Sequence[RegistryDomain]:
        return list(self._registry_domains.values())

    def annotate_step(self, step: "Step") -> List[str]:
        if not self._domains:
            return []
        domain_hint, tags = _extract_domain_hint(step)
        profile, score, matched_tags = self._select_profile(domain_hint, tags)
        if not profile:
            if domain_hint:
                return [
                    f"Phase6 runtime: domain `{domain_hint}` not found in configuration from {self._source}",
                ]
            return ["Phase6 runtime: no eligible domain found for current step."]
        logs = [
            f"Phase6 runtime routed to `{profile.slug}` — {profile.name} (score={score:.2f}).",
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
            logs.append(f"• monthly value flow: {display}")
        if profile.uptime:
            logs.append(f"• uptime: {profile.uptime}")
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
        registry = self._registry_domains.get(profile.slug)
        if registry:
            skill_preview = ", ".join(sorted(registry.skills.keys())) or "—"
            logs.append(f"• registry skills: {skill_preview}")
            if registry.credential_requires:
                logs.append(
                    "• credential rule: "
                    f"attestor={registry.credential_attestor or '—'} "
                    f"schema={registry.credential_schema or '—'}"
                )
            if registry.agents:
                approved = sum(1 for agent in registry.agents if agent.approved)
                active = sum(1 for agent in registry.agents if agent.active or agent.active is None)
                logs.append(
                    "• registry agents: "
                    f"{len(registry.agents)} total / {approved} approved / {active} active"
                )
        logs.append(f"• operations: {profile.operations_summary()}")
        return logs

    def build_bridge_plan(self, slug: str) -> Dict[str, object]:
        profile = self._domains.get(slug.lower())
        if not profile:
            raise KeyError(f"Unknown domain: {slug}")
        cadence = max(profile.heartbeat_seconds, self._global.l2_sync_cadence)
        return {
            "domain": profile.slug,
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
            "infrastructure": profile.infrastructure,
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
        }

    def ingest_iot_signal(self, signal: Dict[str, object]) -> Tuple[str, List[str]]:
        slug = str(signal.get("domain", "")).lower()
        tags = [str(tag) for tag in signal.get("tags", [])]
        _, _, resolved_tags = self._select_profile(slug, tags)
        logs = [
            f"Phase6 runtime ingested IoT signal for `{slug or 'unspecified'}`",
            f"• raw: {json.dumps(signal, sort_keys=True)}",
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
        self, domain_hint: Optional[str], tags: Iterable[str]
    ) -> Tuple[Optional[DomainProfile], float, Set[str]]:
        normalized_tags = {tag.lower() for tag in tags if isinstance(tag, str)}
        if domain_hint:
            profile = self._domains.get(domain_hint.lower())
            if profile:
                return profile, profile.score(normalized_tags), normalized_tags.intersection(profile.skill_tags)
            return None, float("nan"), set()
        best_score = -math.inf
        best_profile: Optional[DomainProfile] = None
        for profile in self._domains.values():
            score = profile.score(normalized_tags)
            if score > best_score:
                best_score = score
                best_profile = profile
        if best_profile is None:
            return None, float("nan"), set()
        return best_profile, best_score, normalized_tags.intersection(best_profile.skill_tags)

    def _load_registry(self, payload: object) -> None:
        if not isinstance(payload, dict):
            raise ValueError("registry payload must be an object")
        manifest = payload.get("manifestHash")
        if manifest:
            self._registry_manifest_hash = _normalize_bytes32(manifest)
        contract = payload.get("contract")
        if contract:
            self._registry_contract = _normalize_address(contract)
        domains_payload = payload.get("domains", [])
        if not isinstance(domains_payload, list):
            raise ValueError("registry.domains must be an array")
        registry_domains: Dict[str, RegistryDomain] = {}
        for entry in domains_payload:
            if not isinstance(entry, dict):
                raise ValueError("registry domain entries must be objects")
            slug_raw = str(entry.get("slug", "")).strip()
            if not slug_raw:
                raise ValueError("registry domain slug is required")
            slug = slug_raw.lower()
            domain_id = _normalize_bytes32(entry.get("domainId"))
            if not domain_id:
                domain_id = _keccak_hex(slug)
            manifest_hash = _normalize_bytes32(entry.get("manifestHash")) or _ZERO_BYTES32
            metadata_uri = str(entry.get("metadataURI", "")).strip()
            credential_rule = entry.get("credentialRule") or {}
            if credential_rule and not isinstance(credential_rule, dict):
                raise ValueError(f"registry domain {slug} credentialRule must be an object")
            credential_requires = bool(credential_rule.get("requiresCredential", False))
            registry_domain = RegistryDomain(
                slug=slug,
                domain_id=domain_id,
                manifest_hash=manifest_hash,
                metadata_uri=metadata_uri or f"ipfs://phase6/domains/{slug}.json",
                active=bool(entry.get("active", True)),
                credential_requires=credential_requires,
                credential_attestor=_normalize_address(credential_rule.get("attestor")),
                credential_schema=_normalize_bytes32(credential_rule.get("schemaId")),
                credential_uri=str(credential_rule.get("uri", "")).strip() or None,
            )
            skills_payload = entry.get("skills", [])
            if not isinstance(skills_payload, list):
                raise ValueError(f"registry domain {slug} skills must be an array")
            for skill_entry in skills_payload:
                if not isinstance(skill_entry, dict):
                    raise ValueError(f"registry domain {slug} skill entries must be objects")
                key_raw = str(skill_entry.get("key", "")).strip()
                if not key_raw:
                    raise ValueError(f"registry domain {slug} skill.key required")
                skill_key = key_raw.lower()
                skill_id = _normalize_bytes32(skill_entry.get("id"))
                if not skill_id:
                    skill_id = _keccak_hex(skill_key)
                registry_domain.skills[skill_key] = RegistrySkill(
                    key=skill_key,
                    skill_id=skill_id,
                    label=str(skill_entry.get("label", key_raw)).strip() or key_raw,
                    metadata_uri=str(skill_entry.get("metadataURI", "")).strip(),
                    requires_credential=bool(skill_entry.get("requiresCredential", False)),
                    active=bool(skill_entry.get("active", True)),
                )
            agents_payload = entry.get("agents", [])
            if not isinstance(agents_payload, list):
                raise ValueError(f"registry domain {slug} agents must be an array")
            for agent_entry in agents_payload:
                if not isinstance(agent_entry, dict):
                    raise ValueError(f"registry domain {slug} agent entries must be objects")
                address = _normalize_address(agent_entry.get("address"))
                if not address:
                    raise ValueError(f"registry domain {slug} agent missing address")
                alias = str(agent_entry.get("alias", address)).strip() or address
                did = str(agent_entry.get("did", "")).strip()
                manifest_hash_agent = _normalize_bytes32(agent_entry.get("manifestHash")) or _ZERO_BYTES32
                credential_hash = _normalize_bytes32(agent_entry.get("credentialHash"))
                skills = {
                    str(skill).strip().lower()
                    for skill in _ensure_array(agent_entry.get("skills"))
                    if isinstance(skill, str) and skill.strip()
                }
                registry_domain.agents.append(
                    RegistryAgent(
                        address=address,
                        alias=alias,
                        did=did,
                        manifest_hash=manifest_hash_agent,
                        credential_hash=credential_hash,
                        skills=skills,
                        approved=_coerce_optional_bool(agent_entry.get("approved")),
                        active=_coerce_optional_bool(agent_entry.get("active")),
                        note=str(agent_entry.get("note", "")).strip() or None,
                    )
                )
            registry_domains[slug] = registry_domain
        self._registry_domains = registry_domains


def _keccak_hex(value: str) -> str:
    data = value.encode("utf-8")
    if _auto_keccak is not None:
        try:
            digest = _auto_keccak(data)
        except Exception:  # pragma: no cover - fallback to hashlib
            digest = hashlib.sha3_256(data).digest()
    else:  # pragma: no cover - fallback when eth_hash unavailable
        digest = hashlib.sha3_256(data).digest()
    return "0x" + digest.hex()


def _ensure_array(value: object) -> List[object]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, set):
        return list(value)
    return [value]


def _normalize_infrastructure(
    payload: object,
    context: str,
    *,
    require_layer: bool,
) -> List[Dict[str, str]]:
    if payload is None:
        return []
    if not isinstance(payload, list):
        raise ValueError(f"{context} infrastructure must be an array")
    normalized: List[Dict[str, str]] = []
    for idx, infra_entry in enumerate(payload):
        if not isinstance(infra_entry, dict):
            raise ValueError(f"{context} infrastructure[{idx}] must be an object")
        layer = str(infra_entry.get("layer", "")).strip()
        name = str(infra_entry.get("name", "")).strip()
        role = str(infra_entry.get("role", "")).strip()
        status = str(infra_entry.get("status", "")).strip()
        if require_layer and not layer:
            raise ValueError(f"{context} infrastructure[{idx}] missing required fields")
        if not name or not role or not status:
            raise ValueError(f"{context} infrastructure[{idx}] missing required fields")
        entry_norm: Dict[str, str] = {
            "name": name,
            "role": role,
            "status": status,
        }
        if layer:
            entry_norm["layer"] = layer
        provider = infra_entry.get("provider")
        if provider is not None:
            provider_text = str(provider).strip()
            if provider_text:
                entry_norm["provider"] = provider_text
        endpoint = infra_entry.get("endpoint") or infra_entry.get("uri")
        if endpoint is not None:
            endpoint_text = str(endpoint).strip()
            if endpoint_text:
                entry_norm["endpoint"] = endpoint_text
        normalized.append(entry_norm)
    return normalized


def _normalize_bytes32(value: object) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if not text.startswith("0x") or len(text) != 66:
        raise ValueError(f"invalid bytes32 value: {value}")
    if text == _ZERO_BYTES32:
        return None
    return text


def _normalize_address(value: object) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text == "0x0000000000000000000000000000000000000000":
        return None
    return text


def _parse_float(value: object) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().rstrip("%")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _extract_domain_hint(step: "Step") -> Tuple[Optional[str], Set[str]]:
    domain_hint: Optional[str] = None
    tags: Set[str] = set()
    params = step.params if isinstance(step.params, dict) else {}
    if isinstance(params, dict):
        for key in ("domain", "phase6Domain", "targetDomain", "industry"):
            value = params.get(key)
            if isinstance(value, str) and value:
                domain_hint = value
                break
        for key in ("tags", "skills", "capabilities", "industries"):
            value = params.get(key)
            if isinstance(value, (list, tuple)):
                for entry in value:
                    if isinstance(entry, str) and entry:
                        tags.add(entry)
    metadata = step.metadata if isinstance(getattr(step, "metadata", None), dict) else {}
    if isinstance(metadata, dict):
        hint = metadata.get("domain")
        if isinstance(hint, str) and hint:
            domain_hint = hint
        tag_payload = metadata.get("tags")
        if isinstance(tag_payload, (list, tuple)):
            for entry in tag_payload:
                if isinstance(entry, str) and entry:
                    tags.add(entry)
    return domain_hint, tags


def load_runtime(path: Optional[Path] = None) -> DomainExpansionRuntime:
    """Load the runtime using the default configuration or an override."""

    if path is None:
        override = os.environ.get("PHASE6_DOMAIN_CONFIG")
        if override:
            path = Path(override)
        else:
            path = _DEFAULT_CONFIG
    if not path.exists():
        _LOG.warning("Phase 6 configuration %s missing; returning empty runtime", path)
        return DomainExpansionRuntime([], GlobalControls(), source=path)
    return DomainExpansionRuntime.from_file(path)
