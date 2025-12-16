"""Run the Astral Omnidominion Operating System Command Theatre demo.

This lightweight runner keeps the experience hermetic and non-interactive so
it can be executed in CI or local sandboxes without hidden dependencies. The
script surfaces a concise mission-readiness report that references the
available playbooks and governance guides while computing deterministic
resilience metrics inspired by coordination theory.
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

# The core documents that anchor this demo. If additional guidance is added in
# the future, extend this tuple to keep the report aligned with the catalogue.
DOC_FILES: tuple[str, ...] = (
    "README.md",
    "ci-green-operations.md",
    "launch-playbook.md",
    "mission-review-checklist.md",
    "owner-control-field-guide.md",
)


@dataclass(frozen=True)
class MissionDocument:
    """Metadata extracted from a demo document."""

    name: str
    path: Path
    line_count: int
    title: str


@dataclass(frozen=True)
class DemoReport:
    """Structured payload persisted by the runner."""

    generated_at: str
    documents: list[MissionDocument]
    coverage: float
    scores: dict[str, float]


def _read_document(base_dir: Path, filename: str) -> MissionDocument | None:
    path = base_dir / filename
    if not path.exists():
        return None

    content = path.read_text(encoding="utf-8").splitlines()
    title = next((line.strip("# ") for line in content if line.strip()), "Untitled")
    return MissionDocument(
        name=filename,
        path=path.resolve(),
        line_count=len(content),
        title=title,
    )


def _load_documents(base_dir: Path) -> list[MissionDocument]:
    docs: list[MissionDocument] = []
    for filename in DOC_FILES:
        doc = _read_document(base_dir, filename)
        if doc:
            docs.append(doc)
    return docs


def _bounded_score(value: float, *, floor: float = 0.0, ceiling: float = 1.0) -> float:
    return max(floor, min(ceiling, value))


def _compute_scores(documents: Iterable[MissionDocument]) -> dict[str, float]:
    docs = list(documents)
    if not docs:
        # With no documents available, the system has no signal; return neutral
        # scores so downstream tooling can detect the gap without crashing.
        return {
            "coordination_hamiltonian": 0.0,
            "gibbs_free_energy_surplus": 0.0,
            "game_theory_payoff": 0.0,
        }

    avg_lines = sum(doc.line_count for doc in docs) / len(docs)
    coordination = 1 - math.exp(-avg_lines / 100)
    gibbs_surplus = math.log1p(len(docs)) / math.log(10)
    payoff = 0.5 + 0.5 * (len([d for d in docs if d.line_count > 0]) / len(DOC_FILES))

    return {
        "coordination_hamiltonian": _bounded_score(coordination),
        "gibbs_free_energy_surplus": _bounded_score(gibbs_surplus),
        "game_theory_payoff": _bounded_score(payoff),
    }


def build_report(base_dir: Path) -> DemoReport:
    documents = _load_documents(base_dir)
    coverage = len(documents) / len(DOC_FILES)
    scores = _compute_scores(documents)
    generated_at = datetime.now(timezone.utc).isoformat()
    return DemoReport(
        generated_at=generated_at,
        documents=documents,
        coverage=coverage,
        scores=scores,
    )


def _serialise_report(report: DemoReport) -> dict:
    return {
        "generated_at": report.generated_at,
        "coverage": report.coverage,
        "scores": report.scores,
        "documents": [
            {
                "name": doc.name,
                "path": str(doc.path),
                "line_count": doc.line_count,
                "title": doc.title,
            }
            for doc in report.documents
        ],
    }


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("reports/astral-omnidominion-operating-system-command-theatre/report.json"),
        help="Destination for the JSON report.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None, base_dir: Path | None = None) -> int:
    args = _parse_args(argv)
    base_dir = base_dir or Path(__file__).resolve().parent

    report = build_report(base_dir)
    output_path: Path = args.output.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(_serialise_report(report), indent=2), encoding="utf-8")

    print("🌠 Astral Omnidominion Operating System Command Theatre")
    print(f"   • Documents inspected : {len(report.documents)} of {len(DOC_FILES)}")
    print(f"   • Coordination metric : {report.scores['coordination_hamiltonian']:.3f}")
    print(f"   • Gibbs surplus       : {report.scores['gibbs_free_energy_surplus']:.3f}")
    print(f"   • Game theory payoff  : {report.scores['game_theory_payoff']:.3f}")
    print(f"   • Report              : {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
