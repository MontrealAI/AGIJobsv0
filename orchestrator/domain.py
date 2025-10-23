from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


@dataclass(frozen=True)
class DomainProfile:
    """Static description of a domain the orchestrator can target."""

    slug: str
    name: str
    keywords: Tuple[str, ...]
    oracle: str
    dispatcher: str
    l2_gateway: str
    requires_human_review: bool
    resilience_floor: int
    max_concurrent_jobs: int
    metadata_uri: str
    credential_schema: str
    l2_network: str

    def as_dict(self) -> Dict[str, object]:
        return {
            'slug': self.slug,
            'name': self.name,
            'keywords': list(self.keywords),
            'oracle': self.oracle,
            'dispatcher': self.dispatcher,
            'l2Gateway': self.l2_gateway,
            'requiresHumanReview': self.requires_human_review,
            'resilienceFloor': self.resilience_floor,
            'maxConcurrentJobs': self.max_concurrent_jobs,
            'metadataURI': self.metadata_uri,
            'credentialSchema': self.credential_schema,
            'l2Network': self.l2_network,
        }


_DEFAULT_CATALOG: Tuple[DomainProfile, ...] = (
    DomainProfile(
        slug='logistics',
        name='Autonomous Supply & Logistics',
        keywords=(
            'logistics',
            'supply chain',
            'fleet',
            'warehouse',
            'routing',
            'delivery',
            'iot',
            'fulfilment',
        ),
        oracle='chainlink.l2.iot',
        dispatcher='module.routing.mesh',
        l2_gateway='optimism-mainnet-gateway',
        requires_human_review=False,
        resilience_floor=85,
        max_concurrent_jobs=1024,
        metadata_uri='ipfs://agijobs-phase6/logistics.json',
        credential_schema='schema:logistics.operator@1',
        l2_network='optimism-mainnet',
    ),
    DomainProfile(
        slug='finance',
        name='Global Financial Intelligence',
        keywords=(
            'financial',
            'banking',
            'portfolio',
            'risk model',
            'fintech',
            'credit',
            'treasury',
            'markets',
        ),
        oracle='eigenlayer.nav.oracleset',
        dispatcher='module.research.capital',
        l2_gateway='base-mainnet-gateway',
        requires_human_review=True,
        resilience_floor=92,
        max_concurrent_jobs=256,
        metadata_uri='ipfs://agijobs-phase6/finance.json',
        credential_schema='schema:finance.specialist@3',
        l2_network='base-mainnet',
    ),
    DomainProfile(
        slug='healthcare',
        name='Healthcare Knowledge & Triage',
        keywords=(
            'patient',
            'diagnosis',
            'medical',
            'clinical',
            'hospital',
            'triage',
            'health',
            'care plan',
        ),
        oracle='medtrust.did.oracle',
        dispatcher='module.triage.caremesh',
        l2_gateway='polygon-zkevm-gateway',
        requires_human_review=True,
        resilience_floor=95,
        max_concurrent_jobs=180,
        metadata_uri='ipfs://agijobs-phase6/healthcare.json',
        credential_schema='schema:healthcare.expert@5',
        l2_network='polygon-zkevm',
    ),
    DomainProfile(
        slug='climate',
        name='Climate & Energy Optimisation',
        keywords=(
            'climate',
            'energy',
            'grid',
            'carbon',
            'renewable',
            'weather',
            'sustainability',
        ),
        oracle='energy.mesh.oracle',
        dispatcher='module.optimisation.planetary',
        l2_gateway='starknet-gateway',
        requires_human_review=False,
        resilience_floor=88,
        max_concurrent_jobs=640,
        metadata_uri='ipfs://agijobs-phase6/climate.json',
        credential_schema='schema:climate.engineer@2',
        l2_network='starknet-mainnet',
    ),
)


def _tokenise(text: str) -> List[str]:
    clean = re.sub(r'[^a-z0-9\s]', ' ', text.lower())
    return [token for token in clean.split() if token]


class DomainRouter:
    """Score candidate domains using keyword heuristics and hints."""

    def __init__(self, catalog: Sequence[DomainProfile] | None = None) -> None:
        self._profiles: Dict[str, DomainProfile] = {
            profile.slug: profile for profile in (catalog or _DEFAULT_CATALOG)
        }
        self._keyword_index: Dict[str, List[str]] = {}
        for slug, profile in self._profiles.items():
            for keyword in profile.keywords:
                self._keyword_index.setdefault(keyword.lower(), []).append(slug)

    @property
    def slugs(self) -> Sequence[str]:  # pragma: no cover - trivial
        return tuple(self._profiles.keys())

    def profile(self, slug: str) -> Optional[DomainProfile]:
        return self._profiles.get(slug)

    def classify(
        self,
        text: str,
        *,
        hints: Iterable[str] = (),
        min_score: float = 1.0,
    ) -> Optional[DomainProfile]:
        tokens = _tokenise(text)
        for hint in hints:
            tokens.extend(_tokenise(hint))

        if not tokens:
            return None

        scores: Dict[str, float] = {slug: 0.0 for slug in self._profiles}
        for token in tokens:
            matches = self._keyword_index.get(token)
            if not matches:
                continue
            weight = 1.0 + math.log(1 + tokens.count(token))
            for slug in matches:
                scores[slug] += weight

        best_slug = max(scores, key=scores.get)
        if scores[best_slug] < min_score:
            return None
        return self._profiles[best_slug]

    def build_trigger(
        self,
        profile: DomainProfile,
        payload: Optional[Dict[str, object]] = None,
    ) -> Dict[str, object]:
        trigger = {
            'domain': profile.slug,
            'dispatcher': profile.dispatcher,
            'oracle': profile.oracle,
            'l2Gateway': profile.l2_gateway,
            'requiresHumanReview': profile.requires_human_review,
            'resilienceFloor': profile.resilience_floor,
        }
        if payload:
            trigger['payload'] = payload
        return trigger

    def summary(self) -> List[Dict[str, object]]:
        return [profile.as_dict() for profile in self._profiles.values()]


def resolve_domain_from_intent(
    intent: 'JobIntent', router: DomainRouter
) -> Optional[DomainProfile]:
    candidate_hints: List[str] = []
    constraint_keys = ('domain', 'industry', 'vertical')
    for key in constraint_keys:
        value = intent.constraints.get(key)
        if isinstance(value, str) and value:
            candidate_hints.append(value)
    if intent.title:
        candidate_hints.append(intent.title)

    preferred = intent.constraints.get('domain')
    if isinstance(preferred, str) and router.profile(preferred.lower()):
        profile = router.profile(preferred.lower())
        intent.domain = profile.slug if profile else preferred.lower()
        intent.domain_profile = profile.as_dict() if profile else None
        return profile

    base_text = intent.description or ''
    profile = router.classify(base_text, hints=candidate_hints)
    if profile:
        intent.domain = profile.slug
        intent.constraints['domain'] = profile.slug
        intent.domain_profile = profile.as_dict()
    return profile


__all__ = ['DomainProfile', 'DomainRouter', 'resolve_domain_from_intent']
