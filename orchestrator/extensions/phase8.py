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
    heartbeat_seconds: float
    guardian_window_seconds: float
    max_drawdown_bps: int


class Phase8DominionRuntime:
    """Runtime helper that selects Phase 8 dominions and surfaces guardrails."""

    def __init__(
        self,
        dominions: Sequence[DominionProfile],
        sentinels: Sequence[SentinelProfile],
        streams: Sequence[CapitalStreamProfile],
        global_parameters: GlobalParameters,
        source: Optional[Path] = None,
    ) -> None:
        self._dominions: Dict[str, DominionProfile] = {dom.slug: dom for dom in dominions}
        self._sentinels = {s.slug: s for s in sentinels}
        self._streams = {s.slug: s for s in streams}
        self._global = global_parameters
        self._source = source
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
            )
            for entry in payload.get("capitalStreams", [])
            if isinstance(entry, dict)
        ]

        return cls(dominions, sentinels, streams, global_parameters, source=source)

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
        return (
            f"treasury={self._global.treasury} pause={self._global.system_pause} guardians={self._global.guardian_council} "
            f"coverage={sentinel_minutes:.1f}m window={self._global.guardian_window_seconds/60:.1f}m drawdown={self._global.max_drawdown_bps}bps"
        )

    def select_dominion(self, tags: Sequence[str]) -> Optional[DominionProfile]:
        if not self._dominions:
            return None
        best: Optional[DominionProfile] = None
        best_score = float("-inf")
        for domain in self._dominions.values():
            score = domain.score(tags)
            if score > best_score:
                best = domain
                best_score = score
        return best

    def annotate_step(self, step: "Step") -> List[str]:
        tags = list(getattr(step, "capabilities", []) or [])
        chosen = self.select_dominion(tags)
        notes: List[str] = []
        if not chosen:
            notes.append("Phase8 runtime: no dominion selected (check manifest)")
            return notes
        notes.append(
            "Phase8 runtime routed to `%(slug)s` — %(name)s" % {"slug": chosen.slug, "name": chosen.name}
        )
        notes.append(f"• profile: {chosen.describe()}")
        sentinel_links = [
            sentinel.describe()
            for sentinel in self._sentinels.values()
            if chosen.slug in sentinel.domains or not sentinel.domains
        ]
        if sentinel_links:
            notes.append("• sentinel coverage: " + " | ".join(sentinel_links))
        stream_links = [
            stream.describe()
            for stream in self._streams.values()
            if chosen.slug in stream.domains or not stream.domains
        ]
        if stream_links:
            notes.append("• capital streams: " + " | ".join(stream_links))
        notes.append("• guardian summary: " + self.guardian_summary())
        if self._source:
            notes.append(f"• manifest source: {self._source}")
        return notes


def load_runtime(manifest: Optional[Path] = None) -> Phase8DominionRuntime:
    """Load a Phase 8 runtime from disk."""

    path = manifest or _DEFAULT_MANIFEST
    return Phase8DominionRuntime.from_file(path)
