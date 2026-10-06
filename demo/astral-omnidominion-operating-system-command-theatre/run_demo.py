"""Offline command theatre: inspect guides, rehearse file work, and export evidence.

Uses Python's standard library only. No provider, browser, wallet or chain is
contacted. A passing rehearsal is not production or settlement authorization.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
import re
import sys
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

DOC_FILES = (
    "README.md", "ci-green-operations.md", "launch-playbook.md",
    "mission-review-checklist.md", "owner-control-field-guide.md", "computer-work.md",
)
ARTIFACT_NAMES = {"task.json", "source-ledger.json", "deliverable.json", "review.json", "work-catalog.json"}
MAX_FILE_BYTES = 1_048_576


@dataclass(frozen=True)
class MissionDocument:
    name: str
    path: Path
    line_count: int
    title: str
    sha256: str


@dataclass(frozen=True)
class DemoReport:
    generated_at: str
    documents: list[MissionDocument]
    coverage: float
    scores: dict[str, float]
    issues: list[str]


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read_bytes(path: Path) -> bytes:
    with path.open("rb") as stream:
        data = stream.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise ValueError(f"File exceeds {MAX_FILE_BYTES} bytes: {path.name}")
    return data


def _read_document(base_dir: Path, filename: str) -> MissionDocument | None:
    path = base_dir / filename
    if not path.exists():
        return None
    raw = _read_bytes(path)
    lines = raw.decode("utf-8").splitlines()
    if not any(line.strip() for line in lines):
        return None
    title = next((line.strip("# ") for line in lines if line.strip()), "Untitled")
    return MissionDocument(filename, path.resolve(), len(lines), title, _digest(raw))


def _load_documents(base_dir: Path) -> list[MissionDocument]:
    return [doc for name in DOC_FILES if (doc := _read_document(base_dir, name))]


def _bounded_score(value: float, *, floor: float = 0.0, ceiling: float = 1.0) -> float:
    return max(floor, min(ceiling, value))


def _compute_scores(documents: Iterable[MissionDocument]) -> dict[str, float]:
    docs = list(documents)
    values = (0.0, 0.0, 0.0)
    if docs:
        avg_lines = sum(doc.line_count for doc in docs) / len(docs)
        values = (1 - math.exp(-avg_lines / 100), math.log1p(len(docs)) / math.log(10),
                  0.5 + 0.5 * len(docs) / len(DOC_FILES))
    return dict(zip(("coordination_hamiltonian", "gibbs_free_energy_surplus", "game_theory_payoff"),
                    map(_bounded_score, values)))


def build_report(base_dir: Path) -> DemoReport:
    documents, issues = [], []
    for name in DOC_FILES:
        try:
            doc = _read_document(base_dir, name)
            if doc is None:
                issues.append(f"Missing or empty document: {name}")
            else:
                documents.append(doc)
        except (OSError, UnicodeError, ValueError) as exc:
            issues.append(f"Cannot inspect {name}: {exc}")
    return DemoReport(datetime.now(timezone.utc).isoformat(), documents,
                      len(documents) / len(DOC_FILES), _compute_scores(documents), issues)


def _serialise_report(report: DemoReport) -> dict:
    return {
        "schema_version": 2, "generated_at": report.generated_at,
        "coverage": report.coverage, "scores": report.scores,
        "score_basis": "Legacy document-length illustrations; not readiness, physics or economic measurements.",
        "issues": report.issues,
        "documents": [dict(name=d.name, path=str(d.path), line_count=d.line_count,
                           title=d.title, sha256=d.sha256) for d in report.documents],
    }


def load_catalog(path: Path) -> dict:
    catalog = json.loads(_read_bytes(path))
    if not isinstance(catalog, dict) or type(catalog.get("schema_version")) is not int or catalog["schema_version"] != 1:
        raise ValueError("Unsupported work catalog schema")
    market = catalog.get("market")
    if (not isinstance(market, dict) or type(market.get("annual_usd")) is not int
            or not 0 < market["annual_usd"] <= 10**15
            or market.get("verified") is not False or market.get("basis") != "project planning assumption"):
        raise ValueError("Market value must remain an explicitly unverified planning assumption")
    jobs = catalog.get("jobs")
    if not isinstance(jobs, list) or not 1 <= len(jobs) <= 100:
        raise ValueError("Work catalog must contain 1–100 jobs")
    seen = set()
    allowed = {"browser", "computer", "files", "spreadsheets", "documents", "presentations", "code"}
    for job in jobs:
        if not isinstance(job, dict):
            raise ValueError("Invalid job entry")
        for key in ("id", "title", "deliverable", "acceptance"):
            if not isinstance(job.get(key), str) or not job[key].strip() or len(job[key]) > 500:
                raise ValueError(f"Invalid job {key}")
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", job["id"]) or job["id"] in seen:
            raise ValueError("Job IDs must be unique lowercase slugs")
        seen.add(job["id"])
        if type(job.get("budget_usdc")) is not int or not 0 < job["budget_usdc"] <= 1_000_000:
            raise ValueError("Job budgets must be positive integer USDC planning amounts")
        caps = job.get("capabilities")
        if not isinstance(caps, list) or not caps or any(not isinstance(c, str) or c not in allowed for c in caps):
            raise ValueError("Unknown or missing capability")
    if "reconciliation" not in seen:
        raise ValueError("Catalog must include the executable reconciliation task")
    return catalog


def _json_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8")


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            name = stream.name
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)


def check_deliverable(source: list[dict], candidate: dict) -> dict:
    if not isinstance(source, list) or not 1 <= len(source) <= 10000 or not isinstance(candidate, dict):
        raise ValueError("Invalid ledger or candidate structure")
    unique, counts = {}, {}
    for row in source:
        if (not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"]
                or type(row.get("amount_cents")) is not int or abs(row["amount_cents"]) > 10**12):
            raise ValueError("Ledger entries require an ID and bounded integer cents")
        if row["id"] in unique and unique[row["id"]] != row:
            raise ValueError("Conflicting source IDs require human reconciliation")
        unique[row["id"]] = row
        counts[row["id"]] = counts.get(row["id"], 0) + 1
    expected_total = sum(row["amount_cents"] for row in unique.values())
    checks = {
        "source_row_count": type(candidate.get("source_rows")) is int and candidate["source_rows"] == len(source),
        "unique_row_count": type(candidate.get("unique_rows")) is int and candidate["unique_rows"] == len(unique),
        "duplicate_count": type(candidate.get("duplicate_rows")) is int and candidate["duplicate_rows"] == len(source) - len(unique),
        "total_recomputed": type(candidate.get("total_cents")) is int and candidate["total_cents"] == expected_total,
        "deduplicated_ledger": _json_bytes(candidate.get("deduplicated_ledger")) == _json_bytes(list(unique.values())),
        "duplicate_identities": candidate.get("duplicate_ids") == sorted(key for key, count in counts.items() if count > 1),
    }
    return {"accepted": all(checks.values()), "checks": checks,
            "reviewer": "separate deterministic checker function; same process, no independent identity",
            "human_review": "required before real delivery", "settlement_approved": False}


def rehearse(catalog: dict, scenario: str, bundle: Path, output_dir: Path) -> dict:
    job = next(job for job in catalog["jobs"] if job["id"] == "reconciliation")
    task = {"schema_version": 1, "job": job, "input_class": "synthetic",
            "mode": "offline-fixture", "allowed_actions": ["read fixture", "write local evidence"],
            "signer_access": False, "provider_dispatch": False, "settlement_approved": False}
    if scenario == "paused":
        return {"status": "blocked", "reason": "Operator pause: no task executed", "artifacts": [],
                "accepted": False, "task_sha256": _digest(_json_bytes(task))}
    source = [{"id": "A-001", "amount_cents": 12500}, {"id": "A-002", "amount_cents": 7500},
              {"id": "A-001", "amount_cents": 12500}, {"id": "A-003", "amount_cents": 1999}]
    seen, duplicates, ledger, total = set(), set(), [], 0
    for row in source:
        if row["id"] not in seen:
            seen.add(row["id"])
            ledger.append(dict(row))
            total += row["amount_cents"]
        else:
            duplicates.add(row["id"])
    candidate = {"source_rows": len(source), "unique_rows": len(seen),
                 "duplicate_rows": len(source) - len(seen),
                 "total_cents": total + (1 if scenario == "rejected" else 0),
                 "deduplicated_ledger": ledger, "duplicate_ids": sorted(duplicates)}
    review = check_deliverable(source, candidate)
    bundle.mkdir(parents=True, exist_ok=False)
    artifacts = []
    for name, value in (("task.json", task), ("source-ledger.json", source),
                        ("deliverable.json", candidate), ("review.json", review), ("work-catalog.json", catalog)):
        data = _json_bytes(value)
        path = bundle / name
        _atomic_write(path, data)
        artifacts.append({"path": path.relative_to(output_dir).as_posix(), "sha256": _digest(data), "bytes": len(data)})
    return {"status": "accepted" if review["accepted"] else "rejected", "accepted": review["accepted"],
            "task_sha256": _digest(_json_bytes(task)), "review": review, "artifacts": artifacts,
            "deliverable": candidate}


def verify_report(path: Path) -> dict:
    payload = json.loads(_read_bytes(path))
    if (not isinstance(payload, dict) or payload.get("schema_version") != 2 or payload.get("execution_mode") != "offline-fixture"
            or payload.get("live_provider") is not False or payload.get("settlement_approved") is not False
            or payload.get("browser_executed") is not False or payload.get("production_approved") is not False):
        raise ValueError("Unsupported report or invalid execution boundary")
    work = payload.get("rehearsal", {})
    if not isinstance(work, dict):
        raise ValueError("Invalid rehearsal structure")
    entries = work.get("artifacts", [])
    if not isinstance(entries, list) or len(entries) != len(ARTIFACT_NAMES):
        raise ValueError("A complete rehearsal evidence bundle is required")
    files, parents = {}, set()
    root = path.resolve().parent
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            raise ValueError("Invalid artifact entry")
        relative = Path(entry["path"])
        if relative.is_absolute() or ".." in relative.parts or "\\" in entry["path"]:
            raise ValueError("Evidence path escapes report directory")
        target = root / relative
        if any(part.is_symlink() for part in (target, *target.parents)) or not target.resolve().is_relative_to(root):
            raise ValueError("Evidence symlinks are not supported")
        if target.name not in ARTIFACT_NAMES or target.name in files:
            raise ValueError("Unexpected or duplicated evidence artifact")
        raw = _read_bytes(target)
        if _digest(raw) != entry["sha256"] or len(raw) != entry["bytes"]:
            raise ValueError(f"Evidence integrity mismatch: {relative}")
        files[target.name] = json.loads(raw)
        parents.add(target.parent)
    if len(parents) != 1 or set(files) != ARTIFACT_NAMES:
        raise ValueError("Incomplete or mixed evidence bundles")
    if _digest(_json_bytes(files["task.json"])) != work.get("task_sha256"):
        raise ValueError("Task digest mismatch")
    catalog = load_catalog(next(iter(parents)) / "work-catalog.json")
    task = files["task.json"]
    if (not isinstance(task, dict) or type(task.get("schema_version")) is not int
            or task["schema_version"] != 1
            or task.get("allowed_actions") != ["read fixture", "write local evidence"]
            or task.get("mode") != "offline-fixture"
            or task.get("input_class") != "synthetic" or task.get("signer_access") is not False
            or task.get("provider_dispatch") is not False or task.get("settlement_approved") is not False
            or task.get("job") != next(job for job in catalog["jobs"] if job["id"] == "reconciliation")):
        raise ValueError("Task does not match the offline catalog and authority boundary")
    checked = check_deliverable(files["source-ledger.json"], files["deliverable.json"])
    if (checked != files["review.json"] or checked != work.get("review")
            or files["deliverable.json"] != work.get("deliverable")
            or files["work-catalog.json"] != payload.get("catalog")
            or checked["accepted"] is not work.get("accepted")
            or work.get("status") != ("accepted" if checked["accepted"] else "rejected")):
        raise ValueError("Review does not match recomputed evidence")
    return {"integrity_verified": True, "accepted": checked["accepted"],
            "note": "Local consistency only; hashes do not authenticate the producer or authorize payment."}


def render_dashboard(payload: dict) -> str:
    esc = lambda value: html.escape(str(value), quote=True)
    work = payload["rehearsal"]
    rows = "".join(f'<tr><th scope="row">{esc(j["title"])}</th><td>{j["budget_usdc"]:,} USDC</td>'
                   f'<td>{esc(j["deliverable"])}</td><td>{esc(j["acceptance"])}</td></tr>' for j in payload.get("catalog", {}).get("jobs", []))
    artifacts = "".join(f'<li><a href="{esc(a["path"])}">{esc(Path(a["path"]).name)}</a> '
                        f'<code>{esc(a["sha256"])}</code></li>' for a in work.get("artifacts", []))
    issues = "".join(f'<li>{esc(issue)}</li>' for issue in payload["issues"])
    checks = "".join(f'<li>{"PASS" if passed else "FAIL"} · {esc(name.replace("_", " "))}</li>'
                     for name, passed in work.get("review", {}).get("checks", {}).items())
    market = payload.get("catalog", {}).get("market", {}).get("annual_usd", 0)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Astral Command Theatre — {esc(work["status"])}</title><style>
:root{{color-scheme:dark;font:17px/1.6 system-ui,sans-serif;background:#100b20;color:#f1edff}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(ellipse at top right,#352058,transparent 65%)}}
main{{max-width:1180px;margin:auto;padding:48px 24px}}a{{color:#cbb5ff}}a:focus-visible{{outline:3px solid #71e4c7;outline-offset:5px}}
h1{{font-size:clamp(2rem,5vw,3.8rem);line-height:1.08;max-width:850px;margin:20px 0}}h2{{font-size:1.4rem}}
.eyebrow{{color:#cbb5ff;letter-spacing:.16em;text-transform:uppercase;font-size:.8rem}}.lead{{max-width:800px;color:#d4cce8}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin:32px 0}}
.card,section{{background:#1c142dcc;border:1px solid #57466d;border-radius:16px;padding:24px;margin:20px 0}}
.cards .card{{margin:0}}strong.metric{{display:block;font-size:1.6rem;color:#a2f0dc}}small{{color:#d4cce8}}
code{{font-size:.8rem;overflow-wrap:anywhere}}.table{{overflow-x:auto}}table{{width:100%;border-collapse:collapse;min-width:660px}}th,td{{text-align:left;padding:16px 10px;border-bottom:1px solid #57466d;vertical-align:top}}th{{font-weight:600}}
li{{margin:10px 0}}footer{{color:#d4cce8;margin-top:32px}}.skip{{position:absolute;left:-9999px}}.skip:focus{{left:16px;top:8px}}
@media(prefers-reduced-motion:reduce){{*{{scroll-behavior:auto}}}}@media print{{:root,body{{background:white;color:black}}section,.card{{background:white}}a,small,.lead,footer,strong.metric{{color:black}}}}
</style></head><body><a class="skip" href="#results">Skip to results</a><main>
<p class="eyebrow">AGI Jobs · Astral Omnidominion</p><h1>The command theatre<br>for screen-based work.</h1>
<p class="lead">Define the outcome. Produce a deliverable. Check the evidence. This offline rehearsal turns a synthetic ledger into a reviewable result, with a handoff to real worker commissioning.</p>
<div class="cards"><div class="card"><small>Rehearsal outcome</small><strong class="metric">{esc(work["status"].upper())}</strong><small>{esc(work.get("reason", "Deterministic fixture; no model dispatched"))}</small></div>
<div class="card"><small>Source documentation</small><strong class="metric">{len(payload["documents"])}/{len(DOC_FILES)}</strong><small>Content presence, not runtime readiness</small></div>
<div class="card"><small>Annual market scenario</small><strong class="metric">${market / 10**12:g}T</strong><small>Project assumption · unverified · not revenue</small></div></div>
<section id="results"><h2>Evidence before acceptance</h2><p>Buyer brief → scoped worker → candidate files → separate checker → human review → separately authorized settlement.</p>
<p><b>Live provider: NO · Browser executed: NO · Settlement approved: NO · Production approved: NO</b></p><ul>{checks}{issues}</ul>
<p>The checker is a separate function in the same process. It does not represent an independent validator or a completed marketplace job.</p></section>
<section><h2>Inspect the evidence</h2><ul>{artifacts or '<li>No task artifacts were produced.</li>'}</ul><p>SHA-256 detects changed bytes relative to this report. It is not a signature or proof of correct work. Retain the report with its unique <code>runs/</code> directory.</p></section>
<section><h2>Work the marketplace can commission</h2><p>Illustrative budgets, not quotes or promised earnings. Only ledger reconciliation executes in this Python rehearsal. Other categories require their own worker and acceptance checks.</p>
<div class="table" role="region" aria-label="Work catalog" tabindex="0"><table><thead><tr><th scope="col">Job</th><th scope="col">Planning budget</th><th scope="col">Deliverable</th><th scope="col">Acceptance</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section><h2>Continue with a real screen</h2><p><a href="https://github.com/MontrealAI/AGIJobsv0/blob/main/demo/One-Box/computer-work/README.md">Run the isolated Chromium lab</a>, then follow the <a href="https://github.com/MontrealAI/AGIJobsv0/blob/main/docs/computer-work.md">OpenClaw / ChatGPT Work commissioning guide</a>. Use public, licensed non-personal or synthetic inputs; keep signing authority separate.</p></section>
<footer>Generated {esc(payload["generated_at"])} · Offline, dependency-free report · Original system maps remain in the demo guides.</footer>
</main></body></html>'''


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("reports/astral-omnidominion-operating-system-command-theatre/report.json"), help="JSON report path; a matching .html dashboard is written beside it.")
    parser.add_argument("--scenario", choices=("accepted", "rejected", "paused"), default="accepted", help="Rehearse correct work, a one-cent error, or operator pause.")
    parser.add_argument("--verify-report", type=Path, help="Verify a saved bundle and recompute its acceptance checks without executing work.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None, base_dir: Path | None = None) -> int:
    args = _parse_args(argv)
    base_dir = base_dir or Path(__file__).resolve().parent
    try:
        if args.verify_report:
            print(json.dumps(verify_report(args.verify_report), indent=2))
            return 0
        output_path = args.output.expanduser().absolute()
        if output_path.suffix.lower() != ".json":
            raise ValueError("--output must end in .json")
        if output_path.resolve().is_relative_to(base_dir.resolve()):
            raise ValueError("Write reports outside the demo source directory")
        report = build_report(base_dir)
        payload = _serialise_report(report)
        payload.update(execution_mode="offline-fixture", live_provider=False, browser_executed=False,
                       settlement_approved=False, production_approved=False)
        try:
            payload["catalog"] = load_catalog(base_dir / "work-catalog.json")
        except (OSError, ValueError, UnicodeError) as exc:
            payload["issues"].append(f"Invalid work catalog: {exc}")
        if payload["issues"]:
            payload["rehearsal"] = {"status": "blocked", "reason": "Repair the listed input errors", "accepted": False, "artifacts": []}
        else:
            bundle = output_path.parent / "runs" / uuid.uuid4().hex
            payload["rehearsal"] = rehearse(payload["catalog"], args.scenario, bundle, output_path.parent)
            if payload["rehearsal"]["artifacts"]:
                snapshot = json.loads(json.dumps(payload))
                for entry in snapshot["rehearsal"]["artifacts"]:
                    entry["path"] = Path(entry["path"]).name
                _atomic_write(bundle / "receipt.json", _json_bytes(snapshot))
                _atomic_write(bundle / "index.html", render_dashboard(snapshot).encode("utf-8"))
        _atomic_write(output_path, _json_bytes(payload))
        _atomic_write(output_path.with_suffix(".html"), render_dashboard(payload).encode("utf-8"))
        print("Astral Omnidominion Operating System Command Theatre — OFFLINE REHEARSAL")
        print(f"Outcome: {payload['rehearsal']['status']} | Documents: {len(report.documents)}/{len(DOC_FILES)}")
        print(f"Report: {output_path}\nOpen dashboard: {output_path.with_suffix('.html')}")
        print("Live provider: NO | Settlement approved: NO | Production approved: NO")
        for issue in payload["issues"]:
            print(f"Fix: {issue}", file=sys.stderr)
        return 0 if payload["rehearsal"]["accepted"] else 1
    except (OSError, ValueError, KeyError, TypeError, UnicodeError) as exc:
        print(f"Command theatre failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
