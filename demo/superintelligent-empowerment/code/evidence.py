"""Bounded supplied-evidence ledger; neither source authenticity nor impact attestation."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import stat
from pathlib import Path
import re
import sys
from types import SimpleNamespace

MAX_BYTES = 262144
ROOT = Path(__file__).resolve().parents[3]
SCHEMA = "agijobsv0.initiative-evidence.v1"


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def strict_json(raw):
    if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
        raise ValueError("Packet must be UTF-8 JSON, at most 256 KiB")

    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON field: " + key)
            result[key] = value
        return result

    def invalid(value):
        raise ValueError("Non-finite JSON number: " + value)

    return json.loads(
        raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=invalid
    )


def fields(value, expected, label):
    if not isinstance(value, dict) or set(value) != set(expected):
        raise ValueError(label + " has missing or unknown fields")


def text(value, limit, label):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(label + " must be nonempty bounded text")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise ValueError(label + " must contain valid Unicode") from exc
    return value


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", value):
        raise ValueError(
            "Identifiers must use 1–40 lowercase letters, digits or hyphens"
        )
    return value


def integer(value):
    if type(value) is not int or not 0 <= value <= 1_000_000_000:
        raise ValueError("Values and thresholds must be integers from 0 to 1000000000")
    return value


def canonical(value):
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("utf-8")


def evaluate(packet):
    fields(packet, ["schema", "title", "initiatives", "evidence"], "Packet")
    if packet["schema"] != SCHEMA:
        raise ValueError("Unsupported packet schema")
    text(packet["title"], 200, "Title")
    initiatives, evidence = packet["initiatives"], packet["evidence"]
    if not isinstance(initiatives, list) or not 1 <= len(initiatives) <= 30:
        raise ValueError("Supply 1–30 initiatives")
    if not isinstance(evidence, list) or len(evidence) > 30:
        raise ValueError("Supply at most 30 evidence records")
    sources = {}
    for entry in evidence:
        fields(entry, ["id", "label", "sourceText", "sha256"], "Evidence")
        key = identifier(entry["id"])
        if key in sources:
            raise ValueError("Duplicate evidence identifier")
        text(entry["label"], 200, "Evidence label")
        source = text(entry["sourceText"], 16384, "Evidence source").encode("utf-8")
        if len(source) > 16384 or entry["sha256"] != digest(source):
            raise ValueError("Evidence byte hash mismatch or source exceeds 16 KiB")
        observation = strict_json(source)
        fields(observation, ["metric", "unit", "value"], "Observation")
        text(observation["metric"], 80, "Metric")
        text(observation["unit"], 40, "Unit")
        integer(observation["value"])
        sources[key] = (entry, observation)
    by_id = {}
    for item in initiatives:
        fields(
            item,
            ["id", "title", "claim", "dependencies", "criterion", "evidenceId"],
            "Initiative",
        )
        key = identifier(item["id"])
        if key in by_id:
            raise ValueError("Duplicate initiative identifier")
        text(item["title"], 160, "Initiative title")
        text(item["claim"], 500, "Reported claim")
        deps = item["dependencies"]
        if (
            not isinstance(deps, list)
            or len(deps) > 29
            or any(not isinstance(x, str) for x in deps)
            or len(set(deps)) != len(deps)
        ):
            raise ValueError("Dependencies must be unique identifiers")
        for dep in deps:
            identifier(dep)
        criterion = item["criterion"]
        fields(criterion, ["metric", "unit", "operator", "threshold"], "Criterion")
        text(criterion["metric"], 80, "Metric")
        text(criterion["unit"], 40, "Unit")
        if criterion["operator"] not in ["gte", "lte"]:
            raise ValueError("Criterion operator must be gte or lte")
        integer(criterion["threshold"])
        evidence_id = item["evidenceId"]
        if evidence_id is not None and (
            not isinstance(evidence_id, str) or evidence_id not in sources
        ):
            raise ValueError("Unknown evidence identifier")
        by_id[key] = item
    for item in initiatives:
        if any(dep not in by_id for dep in item["dependencies"]):
            raise ValueError("Unknown initiative dependency")
    # Reuse the established deterministic DAG engine; no fake thermodynamic inputs.
    name = "_empowerment_astral_order"
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "demo/astral-citadel/run_demo.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    ordered = module.topological_order(
        [
            SimpleNamespace(identifier=x["id"], dependencies=x["dependencies"])
            for x in initiatives
        ]
    )
    ledger = []
    ready = set()
    for node in ordered:
        item = by_id[node.identifier]
        criterion = item["criterion"]
        evidence_id = item["evidenceId"]
        observation = None
        source_hash = None
        outcome = "no-evidence"
        if evidence_id is not None:
            source, observation = sources[evidence_id]
            if (
                observation["metric"] != criterion["metric"]
                or observation["unit"] != criterion["unit"]
            ):
                raise ValueError(
                    "Evidence metric/unit must match its criterion exactly"
                )
            value = observation["value"]
            threshold = criterion["threshold"]
            met = (
                value >= threshold
                if criterion["operator"] == "gte"
                else value <= threshold
            )
            outcome = "criterion-met" if met else "criterion-unmet"
            source_hash = source["sha256"]
        blockers = [dep for dep in item["dependencies"] if dep not in ready]
        ready_for_review = outcome == "criterion-met" and not blockers
        if ready_for_review:
            ready.add(item["id"])
        ledger.append(
            {
                "id": item["id"],
                "title": item["title"],
                "reportedClaim": item["claim"],
                "criterion": criterion,
                "evidenceId": evidence_id,
                "sourceSha256": source_hash,
                "reportedValue": observation["value"] if observation else None,
                "criterionOutcome": outcome,
                "blockedBy": blockers,
                "readyForHumanReview": ready_for_review,
            }
        )
    return {
        "schema": "agijobsv0.initiative-ledger.v1",
        "title": packet["title"],
        "entries": ledger,
        "readyCount": len(ready),
        "initiativeCount": len(initiatives),
        "allReadyForHumanReview": len(ready) == len(initiatives),
        "scope": "Consistency of supplied observations and criteria; input-order ties in dependency ordering.",
        "sourceAuthenticityVerified": False,
        "realWorldImpactVerified": False,
        "providerCalls": 0,
        "chainTransactions": 0,
        "settlementApproved": False,
    }


def artifacts(raw):
    packet = strict_json(raw)
    ledger = evaluate(packet)
    report = "# Initiative evidence ledger\n\nSupplied observations only. Source authenticity and real-world impact are unverified.\n\n"
    for item in ledger["entries"]:
        report += f"- {item['id']}: {item['criterionOutcome']}; ready for human review: {item['readyForHumanReview']}; blocked by: {', '.join(item['blockedBy']) or 'none'}\n"
    return {
        "packet.json": raw,
        "ledger.json": canonical(ledger),
        "report.md": report.encode("utf-8"),
    }


def review(directory):
    directory = Path(directory)
    names = ["packet.json", "ledger.json", "report.md", "receipt.json"]
    if directory.is_symlink() or any((directory / name).is_symlink() for name in names):
        raise ValueError("Evidence must not use symlink files")
    raw = read_bounded(directory / "packet.json")
    expected = artifacts(raw)
    receipt = strict_json(read_bounded(directory / "receipt.json"))
    fields(receipt, ["schema", "artifacts"], "Receipt")
    wanted = {
        "schema": "agijobsv0.initiative-artifacts.v1",
        "artifacts": {name: digest(data) for name, data in expected.items()},
    }
    if receipt != wanted or any(
        read_bounded(directory / name) != data for name, data in expected.items()
    ):
        raise ValueError(
            "Artifact content/hash differs from recomputed supplied-input result"
        )
    return {
        "accepted": True,
        "checkedArtifacts": len(expected),
        "sourceAuthenticityVerified": False,
        "realWorldImpactVerified": False,
        "independentHumanApproval": False,
    }


def read_bounded(path):
    descriptor = os.open(
        path, os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0)
    )
    with os.fdopen(descriptor, "rb") as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise ValueError("Input must be a regular file")
        raw = handle.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("File exceeds 256 KiB")
    return raw


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run")
    run.add_argument("--packet", required=True)
    run.add_argument("--output", required=True)
    check = sub.add_parser("review")
    check.add_argument("directory")
    args = parser.parse_args(argv)
    try:
        if args.command == "review":
            result = review(args.directory)
        else:
            raw = read_bounded(args.packet)
            files = artifacts(raw)
            target = Path(args.output).absolute()
            if any(parent.is_symlink() for parent in [target, *target.parents]):
                raise ValueError("Output path must not use symlink aliases")
            target.mkdir()  # Never overwrite an existing run; parent must already exist.
            receipt = {
                "schema": "agijobsv0.initiative-artifacts.v1",
                "artifacts": {name: digest(data) for name, data in files.items()},
            }
            for name, data in {**files, "receipt.json": canonical(receipt)}.items():
                with (target / name).open("xb") as handle:
                    handle.write(data)
            result = review(target)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (ValueError, OSError, UnicodeError, RecursionError) as exc:
        print("Initiative evidence: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
