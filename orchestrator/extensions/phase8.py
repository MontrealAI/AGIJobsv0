"""Phase 8 dominion runtime extension for the Python orchestrator."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from ..models import Step

_LOG = logging.getLogger(__name__)
_DEFAULT_MANIFEST = Path("demo/Phase-8-Universal-Value-Dominance/config/universal.value.manifest.json")
_RESILIENCE_ALERT_THRESHOLD = 0.9


def _coerce_active(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y", "on"}:
            return True
        if normalized in {"false", "0", "no", "n", "off"}:
            return False
    return bool(value)


def _extract_preferences(step: "Step") -> Tuple[Optional[str], Tuple[str, ...]]:
    """Collect a preferred dominion slug and capability tags from a step."""

    domain_hint: Optional[str] = None
    tags: List[str] = []
    seen: set[str] = set()

    def _push_tag(value: str) -> None:
        normalized = value.strip()
        if not normalized:
            return
        lowered = normalized.lower()
        if lowered in seen:
            return
        seen.add(lowered)
        tags.append(normalized)

    params = getattr(step, "params", None)
    if isinstance(params, dict):
        for key in ("domain", "phase8Domain", "targetDomain", "industry"):
            value = params.get(key)
            if isinstance(value, str) and value.strip():
                domain_hint = value
                break
        for key in ("tags", "skills", "capabilities", "industries"):
            value = params.get(key)
            if isinstance(value, (list, tuple, set)):
                for entry in value:
                    if isinstance(entry, str):
                        _push_tag(entry)
    metadata = getattr(step, "metadata", None)
    if isinstance(metadata, dict):
        hint = metadata.get("domain")
        if isinstance(hint, str) and hint.strip():
            domain_hint = hint
        meta_tags = metadata.get("tags")
        if isinstance(meta_tags, (list, tuple, set)):
            for entry in meta_tags:
                if isinstance(entry, str):
                    _push_tag(entry)

    capabilities = getattr(step, "capabilities", None)
    if isinstance(capabilities, (list, tuple, set)):
        for entry in capabilities:
            if isinstance(entry, str):
                _push_tag(entry)

    return (domain_hint, tuple(tags))


@dataclass(slots=True)
class DominionProfile:
    slug: str
    name: str
    metadata_uri: str
    orchestrator: str
    capital_vault: str
    validator_module: str
    policy_kernel: str
    heartbeat_seconds: float
    tvl_limit: int
    autonomy_bps: int
    resilience_index: float
    value_flow_usd: float
    skill_tags: Tuple[str, ...] = field(default_factory=tuple)
    autonomy_narrative: Optional[str] = None
    active: bool = True

    def score(self, tags: Iterable[str]) -> float:
        tags_lower = {tag.lower() for tag in tags}
        intersection = tags_lower.intersection(self.skill_tags)
        base = max(self.resilience_index * 10.0, 1.0)
        if not intersection:
            return base
        return base + float(len(intersection)) * 4.0 + float(self.autonomy_bps) / 1_000.0

    def describe(self) -> str:
        bullets = [
            f"slug={self.slug}",
            f"manifest={self.metadata_uri}",
            f"orchestrator={self.orchestrator}",
            f"validator={self.validator_module}",
            f"vault={self.capital_vault}",
            f"heartbeat={self.heartbeat_seconds}s",
            f"autonomy={self.autonomy_bps}bps",
            f"resilience={self.resilience_index:.3f}",
        ]
        if self.autonomy_narrative:
            bullets.append(self.autonomy_narrative)
        return ", ".join(bullets)


@dataclass(slots=True)
class SentinelProfile:
    slug: str
    name: str
    coverage_seconds: float
    sensitivity_bps: int
    domains: Tuple[str, ...] = field(default_factory=tuple)
    active: bool = True

    def describe(self) -> str:
        return (
            f"{self.name} coverage={self.coverage_seconds}s sensitivity={self.sensitivity_bps}bps domains={','.join(self.domains)}"
        )


@dataclass(slots=True)
class CapitalStreamProfile:
    slug: str
    name: str
    annual_budget: float
    expansion_bps: int
    domains: Tuple[str, ...] = field(default_factory=tuple)
    active: bool = True

    def describe(self) -> str:
        return (
            f"{self.name} budget=${self.annual_budget:,.0f} expansion={self.expansion_bps}bps domains={','.join(self.domains)}"
        )


@dataclass(slots=True)
class GlobalParameters:
    treasury: str
    universal_vault: str
    guardian_council: str
    system_pause: str
    manifest_uri: str
    manifest_hash: str
    heartbeat_seconds: float
    guardian_window_seconds: float
    max_drawdown_bps: int


@dataclass(slots=True)
class AutonomyGuardrails:
    cap_bps: int
    override_minutes: Optional[int] = None
    escalation_channels: Tuple[str, ...] = field(default_factory=tuple)


class Phase8DominionRuntime:
    """Runtime helper that selects Phase 8 dominions and surfaces guardrails."""

    def __init__(
        self,
        dominions: Sequence[DominionProfile],
        sentinels: Sequence[SentinelProfile],
        streams: Sequence[CapitalStreamProfile],
        global_parameters: GlobalParameters,
        source: Optional[Path] = None,
        guardrails: Optional[AutonomyGuardrails] = None,
    ) -> None:
        self._dominions: Dict[str, DominionProfile] = {dom.slug: dom for dom in dominions if dom.active}
        self._sentinels = {s.slug: s for s in sentinels if s.active}
        self._streams = {s.slug: s for s in streams if s.active}
        self._global = global_parameters
        self._source = source
        self._guardrails = guardrails
        _LOG.debug("Loaded Phase 8 manifest %s", source or "<in-memory>")

    @classmethod
    def from_payload(cls, payload: Dict[str, object], source: Optional[Path] = None) -> "Phase8DominionRuntime":
        global_payload = payload.get("global", {})
        if not isinstance(global_payload, dict):
            raise ValueError("global section must be an object")
        global_parameters = GlobalParameters(
            treasury=str(global_payload.get("treasury", "")),
            universal_vault=str(global_payload.get("universalVault", "")),
            guardian_council=str(global_payload.get("guardianCouncil", "")),
            system_pause=str(global_payload.get("systemPause", "")),
            manifest_uri=str(global_payload.get("manifestoURI", "")),
            manifest_hash=str(global_payload.get("manifestoHash", "")),
            heartbeat_seconds=float(global_payload.get("heartbeatSeconds", 0)),
            guardian_window_seconds=float(global_payload.get("guardianReviewWindow", 0)),
            max_drawdown_bps=int(global_payload.get("maxDrawdownBps", 0)),
        )

        dominions = [
            DominionProfile(
                slug=str(entry.get("slug", "")).lower(),
                name=str(entry.get("name", entry.get("slug", "Dominion"))),
                metadata_uri=str(entry.get("metadataURI", "")),
                orchestrator=str(entry.get("orchestrator", "")),
                capital_vault=str(entry.get("capitalVault", "")),
                validator_module=str(entry.get("validatorModule", "")),
                policy_kernel=str(entry.get("policyKernel", "")),
                heartbeat_seconds=float(entry.get("heartbeatSeconds", 0)),
                tvl_limit=int(entry.get("tvlLimit", 0)),
                autonomy_bps=int(entry.get("autonomyLevelBps", 0)),
                resilience_index=float(entry.get("resilienceIndex", 0)),
                value_flow_usd=float(entry.get("valueFlowMonthlyUSD", 0)),
                skill_tags=tuple(tag.lower() for tag in entry.get("skillTags", []) if isinstance(tag, str)),
                autonomy_narrative=str(entry.get("autonomyNarrative", "")) or None,
                active=_coerce_active(entry.get("active", True)),
            )
            for entry in payload.get("domains", [])
            if isinstance(entry, dict)
        ]

        sentinels = [
            SentinelProfile(
                slug=str(entry.get("slug", "")).lower(),
                name=str(entry.get("name", entry.get("slug", "Sentinel"))),
                coverage_seconds=float(entry.get("coverageSeconds", 0)),
                sensitivity_bps=int(entry.get("sensitivityBps", 0)),
                domains=tuple(str(domain).lower() for domain in entry.get("domains", []) if isinstance(domain, str)),
                active=_coerce_active(entry.get("active", True)),
            )
            for entry in payload.get("sentinels", [])
            if isinstance(entry, dict)
        ]

        streams = [
            CapitalStreamProfile(
                slug=str(entry.get("slug", "")).lower(),
                name=str(entry.get("name", entry.get("slug", "Stream"))),
                annual_budget=float(entry.get("annualBudget", 0)),
                expansion_bps=int(entry.get("expansionBps", 0)),
                domains=tuple(str(domain).lower() for domain in entry.get("domains", []) if isinstance(domain, str)),
                active=_coerce_active(entry.get("active", True)),
            )
            for entry in payload.get("capitalStreams", [])
            if isinstance(entry, dict)
        ]

        guardrails: Optional[AutonomyGuardrails] = None
        self_improvement = payload.get("selfImprovement")
        if isinstance(self_improvement, dict):
            guard_payload = self_improvement.get("autonomyGuards")
            if isinstance(guard_payload, dict):
                try:
                    cap = int(guard_payload.get("maxAutonomyBps", 0))
                except (TypeError, ValueError):
                    cap = 0
                override_raw = guard_payload.get("humanOverrideMinutes")
                override_minutes: Optional[int] = None
                if isinstance(override_raw, (int, float)) and override_raw >= 0:
                    override_minutes = int(override_raw)
                channels = tuple(
                    str(channel).strip()
                    for channel in guard_payload.get("escalationChannels", [])
                    if isinstance(channel, str) and channel.strip()
                )
                if cap > 0:
                    guardrails = AutonomyGuardrails(cap_bps=cap, override_minutes=override_minutes, escalation_channels=channels)

        return cls(dominions, sentinels, streams, global_parameters, source=source, guardrails=guardrails)

    @classmethod
    def from_file(cls, path: Path) -> "Phase8DominionRuntime":
        payload = json.loads(path.read_text("utf-8"))
        return cls.from_payload(payload, source=path)

    @classmethod
    def load_default(cls) -> "Phase8DominionRuntime":
        return cls.from_file(_DEFAULT_MANIFEST)

    @property
    def dominions(self) -> Sequence[DominionProfile]:
        return list(self._dominions.values())

    @property
    def sentinels(self) -> Sequence[SentinelProfile]:
        return list(self._sentinels.values())

    @property
    def streams(self) -> Sequence[CapitalStreamProfile]:
        return list(self._streams.values())

    @property
    def source(self) -> Optional[Path]:
        return self._source

    def guardian_summary(self) -> str:
        sentinel_minutes = sum(s.coverage_seconds for s in self._sentinels.values()) / 60.0
        summary = (
            f"treasury={self._global.treasury} pause={self._global.system_pause} guardians={self._global.guardian_council} "
            f"coverage={sentinel_minutes:.1f}m window={self._global.guardian_window_seconds/60:.1f}m drawdown={self._global.max_drawdown_bps}bps"
        )
        if self._guardrails:
            summary += f" autonomy_cap={self._guardrails.cap_bps}bps"
        return summary

    def select_dominion(
        self,
        tags: Sequence[str],
        domain_hint: Optional[str] = None,
    ) -> Optional[DominionProfile]:
        if not self._dominions:
            return None
        if domain_hint:
            hint_key = domain_hint.lower()
            hinted = self._dominions.get(hint_key)
            if hinted:
                return hinted
        best: Optional[DominionProfile] = None
        best_score = float("-inf")
        for domain in self._dominions.values():
            score = domain.score(tags)
            if score > best_score:
                best = domain
                best_score = score
        return best

    def annotate_step(self, step: "Step") -> List[str]:
        domain_hint, tags = _extract_preferences(step)
        normalized_hint = domain_hint.lower() if domain_hint else None
        hint_known = bool(normalized_hint and normalized_hint in self._dominions)
        chosen = self.select_dominion(tags, domain_hint if hint_known else None)
        notes: List[str] = []
        source = self._source or "<in-memory>"
        if domain_hint and not hint_known:
            if chosen:
                notes.append(
                    f"Phase8 runtime: dominion `{domain_hint}` not found in configuration from {source}; "
                    "falling back to highest scoring profile."
                )
            else:
                notes.append(
                    f"Phase8 runtime: dominion `{domain_hint}` not found in configuration from {source}"
                )
        if not chosen:
            if notes:
                return notes
            notes.append("Phase8 runtime: no dominion selected (check manifest)")
            return notes
        notes.append(
            "Phase8 runtime routed to `%(slug)s` — %(name)s" % {"slug": chosen.slug, "name": chosen.name}
        )
        if domain_hint:
            notes.append(f"• domain hint: {domain_hint}")
        if tags:
            joined = ", ".join(sorted({tag.lower() for tag in tags}))
            notes.append(f"• matched tags: {joined}")
        notes.append(f"• profile: {chosen.describe()}")
        matched_sentinels = [
            sentinel
            for sentinel in self._sentinels.values()
            if chosen.slug in sentinel.domains or not sentinel.domains
        ]
        sentinel_links = [sentinel.describe() for sentinel in matched_sentinels]
        coverage_seconds = sum(sentinel.coverage_seconds for sentinel in matched_sentinels)
        if sentinel_links:
            notes.append("• sentinel coverage: " + " | ".join(sentinel_links))
        else:
            notes.append("• sentinel coverage: none — configure sentinel lattice for this dominion")
        stream_links = [
            stream.describe()
            for stream in self._streams.values()
            if chosen.slug in stream.domains or not stream.domains
        ]
        if stream_links:
            notes.append("• capital streams: " + " | ".join(stream_links))
        else:
            notes.append("• capital streams: none mapped — review capital allocation for this dominion")
        notes.append("• guardian summary: " + self.guardian_summary())
        if self._guardrails:
            governance = f"• governance: autonomy cap ≤{self._guardrails.cap_bps}bps"
            if self._guardrails.override_minutes is not None:
                governance += f", human override {self._guardrails.override_minutes}m"
            if self._guardrails.escalation_channels:
                governance += " — escalate via " + " → ".join(self._guardrails.escalation_channels)
            notes.append(governance)
        if self._global.heartbeat_seconds and chosen.heartbeat_seconds > self._global.heartbeat_seconds:
            notes.append(
                "• heartbeat alert: domain heartbeat %.0fs exceeds global heartbeat %.0fs — trigger watchdog escalation"
                % (chosen.heartbeat_seconds, self._global.heartbeat_seconds)
            )
        if chosen.resilience_index and chosen.resilience_index < _RESILIENCE_ALERT_THRESHOLD:
            notes.append(
                "• resilience alert: %.3f below %.3f — route to guardians for reinforcement"
                % (chosen.resilience_index, _RESILIENCE_ALERT_THRESHOLD)
            )
        if (
            self._global.guardian_window_seconds
            and coverage_seconds < self._global.guardian_window_seconds
        ):
            notes.append(
                "• guardrail alert: sentinel coverage %.0fs below guardian review window %.0fs — escalate to guardian council"
                % (coverage_seconds, self._global.guardian_window_seconds)
            )
        if self._guardrails and chosen.autonomy_bps > self._guardrails.cap_bps:
            notes.append(
                "• guardrail alert: domain autonomy %.0fbps exceeds autonomy guard %.0fbps — escalate to guardian council"
                % (chosen.autonomy_bps, self._guardrails.cap_bps)
            )
        if self._source:
            notes.append(f"• manifest source: {self._source}")
        return notes


def load_runtime(manifest: Optional[Path] = None) -> Phase8DominionRuntime:
    """Load a Phase 8 runtime from disk."""

    path = manifest or _DEFAULT_MANIFEST
    return Phase8DominionRuntime.from_file(path)
