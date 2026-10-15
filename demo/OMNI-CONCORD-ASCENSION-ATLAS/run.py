"""Bounded offline dependency and recovery rehearsal using Astral Citadel ordering."""

from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]


def exact(value, keys, name):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError(f"{name} must contain exactly {', '.join(sorted(keys))}")


def integer(value, name, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{name} must be an integer from {low} to {high}")
    return value


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(
        r"[A-Za-z0-9][A-Za-z0-9_-]{0,59}", value
    ):
        raise ValueError(
            "Job identifiers must be 1–60 letters, digits, underscores or hyphens"
        )
    return value


def parse(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    def nonfinite(value):
        raise ValueError(f"Non-finite JSON value: {value}")

    return json.loads(raw, object_pairs_hook=pairs, parse_constant=nonfinite)


def evaluate(scenario):
    exact(
        scenario, {"schema", "title", "budgetCents", "jobs", "recoveredIds"}, "scenario"
    )
    if scenario["schema"] != "agijobs.atlas-recovery.v1":
        raise ValueError("Unsupported scenario schema")
    if not isinstance(scenario["title"], str) or not 1 <= len(scenario["title"]) <= 200:
        raise ValueError("title must contain 1–200 characters")
    budget = integer(scenario["budgetCents"], "budgetCents", 0, 10**12)
    jobs = scenario["jobs"]
    if not isinstance(jobs, list) or not 1 <= len(jobs) <= 100:
        raise ValueError("jobs must contain 1–100 jobs")
    by_id = {}
    for job in jobs:
        exact(
            job,
            {"id", "label", "costCents", "durationMinutes", "dependsOn", "outcome"},
            "job",
        )
        name = identifier(job["id"])
        if name in by_id:
            raise ValueError(f"Duplicate job: {name}")
        by_id[name] = job
        if not isinstance(job["label"], str) or not 1 <= len(job["label"]) <= 120:
            raise ValueError("Job label must contain 1–120 characters")
        integer(job["costCents"], "costCents", 1, 10**10)
        integer(job["durationMinutes"], "durationMinutes", 1, 10080)
        if not isinstance(job["outcome"], str) or job["outcome"] not in {
            "success",
            "fail",
        }:
            raise ValueError("outcome must be success or fail")
        deps = job["dependsOn"]
        if not isinstance(deps, list) or len(deps) > 100:
            raise ValueError("dependsOn must be a bounded list")
        for dep in deps:
            identifier(dep)
        if len(set(deps)) != len(deps):
            raise ValueError("Duplicate dependency")
    for job in jobs:
        if any(dep not in by_id for dep in job["dependsOn"]):
            raise ValueError("Dependency names an unknown job")
    recovered = scenario["recoveredIds"]
    if not isinstance(recovered, list) or len(recovered) > len(jobs):
        raise ValueError("recoveredIds must be a bounded list")
    for name in recovered:
        identifier(name)
        if name not in by_id or by_id[name]["outcome"] != "fail":
            raise ValueError(
                "Only jobs with a declared failed outcome can be recovered"
            )
    if len(set(recovered)) != len(recovered):
        raise ValueError("Duplicate recovered job")
    # Execute the established deterministic graph engine, not a new ordering implementation.
    spec = importlib.util.spec_from_file_location(
        "atlas_astral_order", ROOT / "demo/astral-citadel/run_demo.py"
    )
    engine = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = engine
    spec.loader.exec_module(engine)
    ordered = engine.topological_order(
        [SimpleNamespace(identifier=j["id"], dependencies=j["dependsOn"]) for j in jobs]
    )
    order = [job.identifier for job in ordered]
    states = {
        name: {"id": name, "status": "pending", "finishMinute": None} for name in order
    }
    attempts = []
    spent = 0

    def phase(number, earliest):
        nonlocal spent
        for name in order:
            job, state = by_id[name], states[name]
            if state["status"] == "completed" or (
                number == 2 and state["status"] == "failed" and name not in recovered
            ):
                continue
            blocked = [
                dep for dep in job["dependsOn"] if states[dep]["status"] != "completed"
            ]
            if blocked:
                states[name] = {
                    "id": name,
                    "status": "blocked-dependency",
                    "finishMinute": None,
                    "blockedBy": blocked,
                }
                continue
            if spent + job["costCents"] > budget:
                states[name] = {
                    "id": name,
                    "status": "blocked-budget",
                    "finishMinute": None,
                    "shortfallCents": spent + job["costCents"] - budget,
                }
                continue
            start = max(
                [earliest] + [states[dep]["finishMinute"] for dep in job["dependsOn"]]
            )
            status = (
                "completed"
                if job["outcome"] == "success" or (number == 2 and name in recovered)
                else "failed"
            )
            finish = start + job["durationMinutes"]
            spent += job["costCents"]
            attempts.append(
                {
                    "id": name,
                    "phase": number,
                    "status": status,
                    "costCents": job["costCents"],
                    "startMinute": start,
                    "finishMinute": finish,
                }
            )
            states[name] = {"id": name, "status": status, "finishMinute": finish}

    phase(1, 0)
    first_pass = {
        "jobs": copy.deepcopy(list(states.values())),
        "spentCents": spent,
        "remainingCents": budget - spent,
    }
    if recovered:
        phase(2, max([0] + [attempt["finishMinute"] for attempt in attempts]))
    accepted = all(state["status"] == "completed" for state in states.values())
    return {
        "schema": "agijobs.atlas-recovery-result.v1",
        "mode": "offline-simulation",
        "accepted": accepted,
        "order": order,
        "firstPass": first_pass,
        "jobs": list(states.values()),
        "attempts": attempts,
        "spentCents": spent,
        "remainingCents": budget - spent,
        "completionMinute": (
            max(a["finishMinute"] for a in attempts) if attempts and accepted else None
        ),
        "recoveryAssumptions": list(recovered),
        "executedExternalWork": False,
        "settlementApproved": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scenario", type=Path, default=Path(__file__).with_name("scenario.json")
    )
    args = parser.parse_args()
    with args.scenario.open("rb") as handle:
        raw = handle.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError("Scenario exceeds 1 MB")
    result = evaluate(parse(raw))
    result["scenarioSha256"] = hashlib.sha256(raw).hexdigest()
    print(json.dumps(result, indent=2))
    return 0 if result["accepted"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, TypeError, KeyError, OSError, RecursionError) as error:
        print(f"Invalid scenario: {error}", file=sys.stderr)
        raise SystemExit(2)
