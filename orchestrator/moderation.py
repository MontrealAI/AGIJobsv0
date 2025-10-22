"""Moderation heuristics with manual override support."""

import hashlib
import json
import os
import re
import string
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

from .models import Attachment, Step

_DEFAULT_AUDIT_PATH = Path(
    os.environ.get("ORCHESTRATOR_MODERATION_AUDIT", "storage/validation/moderation.log")
)
_DEFAULT_OVERRIDE_PATH = Path(
    os.environ.get(
        "ORCHESTRATOR_MODERATION_OVERRIDES", "storage/validation/moderation_overrides.json"
    )
)

_FLAGGED_TERMS = {
    "exploit",
    "malware",
    "ddos",
    "ransomware",
    "botnet",
    "phishing",
    "weapon",
    "propaganda",
}

_RISKY_PHRASES = [
    "copy this",  # indicative of potential plagiarism
    "as previously submitted",
    "unaltered excerpt",
]

_RE_WORD = re.compile(r"[\w']+")


@dataclass
class ModerationConfig:
    """Threshold configuration for the moderation gate."""

    toxicity_threshold: float
    plagiarism_threshold: float
    audit_path: Path = _DEFAULT_AUDIT_PATH


@dataclass
class ManualOverride:
    """Manual moderation decision keyed by content fingerprint."""

    fingerprint: str
    action: str
    note: Optional[str] = None
    applied_at: Optional[float] = None

    def to_json(self) -> dict:
        payload = {"fingerprint": self.fingerprint, "action": self.action}
        if self.note is not None:
            payload["note"] = self.note
        if self.applied_at is not None:
            payload["appliedAt"] = self.applied_at
        return payload


class ManualOverrideQueue:
    """Thread-safe helper for moderation override decisions."""

    def __init__(self, path: Path | None = None) -> None:
        self._path = (path or _DEFAULT_OVERRIDE_PATH).resolve()
        self._lock = threading.Lock()
        self._overrides: List[ManualOverride] = []
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._overrides = []
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):  # pragma: no cover - corrupted file
            self._overrides = []
            return
        overrides: List[ManualOverride] = []
        if isinstance(data, list):
            for entry in data:
                fingerprint = entry.get("fingerprint")
                action = entry.get("action")
                if not isinstance(fingerprint, str) or not isinstance(action, str):
                    continue
                applied_raw = entry.get("appliedAt")
                applied_at: Optional[float] = None
                if applied_raw not in (None, ""):
                    try:
                        parsed = float(applied_raw)
                    except (TypeError, ValueError):
                        parsed = None
                    if parsed:
                        applied_at = parsed

                overrides.append(
                    ManualOverride(
                        fingerprint=fingerprint,
                        action=action,
                        note=entry.get("note") if isinstance(entry.get("note"), str) else None,
                        applied_at=applied_at,
                    )
                )
        self._overrides = overrides

    def _persist(self) -> None:
        payload = [override.to_json() for override in self._overrides]
        tmp_path = self._path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, sort_keys=True, indent=2)
        tmp_path.replace(self._path)

    def resolve(self, fingerprint: str) -> Optional[ManualOverride]:
        with self._lock:
            for override in self._overrides:
                if override.fingerprint == fingerprint:
                    override.applied_at = time.time()
                    self._persist()
                    return override
        return None

    def enqueue(self, override: ManualOverride) -> None:
        with self._lock:
            self._overrides.append(override)
            self._persist()


@dataclass
class ModerationReport:
    """Results of moderation heuristics for an orchestration step."""

    toxicity_score: float
    plagiarism_score: float
    toxicity_threshold: float
    plagiarism_threshold: float
    flagged_terms: List[str]
    flagged_passages: List[str]
    blocked: bool
    context: dict

    @property
    def summary(self) -> str:
        decision = "blocked" if self.blocked else "passed"
        return (
            f"Moderation {decision}: toxicity {self.toxicity_score:.2f}"
            f" (limit {self.toxicity_threshold:.2f}), plagiarism {self.plagiarism_score:.2f}"
            f" (limit {self.plagiarism_threshold:.2f})."
        )


def _load_threshold(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, value))


def load_config() -> ModerationConfig:
    """Return the moderation configuration using environment overrides."""

    toxicity = _load_threshold("ORCHESTRATOR_MAX_TOXICITY", 0.35)
    plagiarism = _load_threshold("ORCHESTRATOR_MAX_PLAGIARISM", 0.30)
    audit = Path(os.environ.get("ORCHESTRATOR_MODERATION_AUDIT", str(_DEFAULT_AUDIT_PATH)))
    return ModerationConfig(toxicity_threshold=toxicity, plagiarism_threshold=plagiarism, audit_path=audit)


def _tokenise(text: str) -> List[str]:
    return [match.group(0).lower() for match in _RE_WORD.finditer(text)]


def _toxicity_score(texts: Sequence[str]) -> tuple[float, List[str]]:
    tokens = [token for text in texts for token in _tokenise(text)]
    if not tokens:
        return 0.0, []
    flagged = [token for token in tokens if token in _FLAGGED_TERMS]
    score = len(flagged) / max(len(tokens), 1)
    seen: set[str] = set()
    flagged_unique: List[str] = []
    for token in flagged:
        if token in seen:
            continue
        seen.add(token)
        flagged_unique.append(token)
    return min(score, 1.0), flagged_unique


def _clean_sentence(sentence: str) -> str:
    cleaned = sentence.strip().lower().translate(str.maketrans("", "", string.punctuation))
    return re.sub(r"\s+", " ", cleaned)


def _plagiarism_score(texts: Sequence[str]) -> tuple[float, List[str]]:
    sentences: List[str] = []
    for text in texts:
        sentences.extend(re.split(r"[.!?]\s+", text))

    cleaned = [_clean_sentence(sentence) for sentence in sentences if sentence.strip()]
    if not cleaned:
        return 0.0, []

    seen: dict[str, int] = {}
    duplicates: List[str] = []
    for sentence in cleaned:
        if len(sentence.split()) < 6:
            continue
        count = seen.get(sentence, 0) + 1
        seen[sentence] = count
        if count == 2:
            duplicates.append(sentence)

    score = len(duplicates) / max(len(cleaned), 1)
    return min(score + _phrase_bonus(cleaned), 1.0), duplicates[:5]


def _phrase_bonus(sentences: Sequence[str]) -> float:
    """Apply a small penalty when risky phrases are present."""

    lowered = " ".join(sentences)
    penalty = 0.0
    for phrase in _RISKY_PHRASES:
        if phrase in lowered:
            penalty += 0.05
    return penalty


def _attachments_to_text(attachments: Iterable[Attachment]) -> List[str]:
    texts: List[str] = []
    for attachment in attachments:
        meta = []
        if attachment.name:
            meta.append(attachment.name)
        if attachment.cid:
            meta.append(f"cid:{attachment.cid}")
        if meta:
            texts.append(" ".join(meta))
    return texts


def _fingerprint(texts: Sequence[str]) -> str:
    payload = "||".join(segment.strip() for segment in texts if isinstance(segment, str) and segment.strip())
    if not payload:
        return "0"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


_OVERRIDE_QUEUE = ManualOverrideQueue()


def evaluate_step(
    step: Step,
    *,
    attachments: Iterable[Attachment],
    arena_content: Iterable[str] | None = None,
) -> ModerationReport:
    """Evaluate a moderation step and persist an audit log entry."""

    config = load_config()
    description = step.params.get("description") if isinstance(step.params, dict) else None
    title = step.params.get("title") if isinstance(step.params, dict) else None

    text_segments: List[str] = [segment for segment in (title, description) if isinstance(segment, str)]
    text_segments.extend(_attachments_to_text(attachments))
    if arena_content is not None:
        text_segments.extend([entry for entry in arena_content if isinstance(entry, str) and entry.strip()])

    toxicity, flagged_terms = _toxicity_score(text_segments)
    plagiarism, flagged_sentences = _plagiarism_score(text_segments)

    blocked = toxicity > config.toxicity_threshold or plagiarism > config.plagiarism_threshold

    fingerprint = _fingerprint(text_segments)
    override = _OVERRIDE_QUEUE.resolve(fingerprint)
    override_context: dict | None = None
    if override:
        blocked = override.action.lower() == "block"
        override_context = override.to_json()

    report = ModerationReport(
        toxicity_score=toxicity,
        plagiarism_score=plagiarism,
        toxicity_threshold=config.toxicity_threshold,
        plagiarism_threshold=config.plagiarism_threshold,
        flagged_terms=flagged_terms,
        flagged_passages=flagged_sentences,
        blocked=blocked,
        context={
            "stepId": step.id,
            "stepName": step.name,
            "tool": step.tool,
            "attachments": [attachment.model_dump(exclude_none=True) for attachment in attachments],
            "fingerprint": fingerprint,
        },
    )
    if override_context:
        report.context["override"] = override_context

    _write_audit_log(report, config.audit_path)
    return report


def evaluate_content(content: Sequence[str]) -> ModerationReport:
    """Moderate arbitrary arena content outside of a plan step."""

    dummy_step = Step(
        id="arena-content",
        name="arena-content",
        kind="validate",
        tool="arena.moderation",
        params={"description": "arena content"},
        needs=[],
    )
    return evaluate_step(dummy_step, attachments=[], arena_content=content)


def _write_audit_log(report: ModerationReport, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "toxicityScore": round(report.toxicity_score, 4),
        "toxicityThreshold": round(report.toxicity_threshold, 4),
        "plagiarismScore": round(report.plagiarism_score, 4),
        "plagiarismThreshold": round(report.plagiarism_threshold, 4),
        "flaggedTerms": report.flagged_terms,
        "flaggedPassages": report.flagged_passages,
        "blocked": report.blocked,
        "context": report.context,
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


__all__ = [
    "ManualOverride",
    "ManualOverrideQueue",
    "ModerationConfig",
    "ModerationReport",
    "evaluate_content",
    "evaluate_step",
    "load_config",
]

