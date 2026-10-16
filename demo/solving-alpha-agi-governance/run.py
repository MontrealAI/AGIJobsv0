"""Offline proposal rehearsal; never enacts a vote or transfers a budget."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "demo/agi-governance/run_demo.py"


def integer(value: object, name: str, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{name} must be an integer in [{minimum}, {maximum}]")
    return value


def exact_keys(value: object, keys: set[str], name: str) -> None:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"{name} must contain exactly: {', '.join(sorted(keys))}")


def parse_scenario(raw: bytes) -> dict:
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    def reject_constant(value):
        raise ValueError(f"Non-finite JSON number: {value}")

    return json.loads(raw.decode("utf-8"), object_pairs_hook=unique, parse_constant=reject_constant)


def evaluate(scenario: dict) -> dict:
    if (
        not isinstance(scenario, dict)
        or scenario.get("schema") != "agijobs.governance-rehearsal.v1"
    ):
        raise ValueError("Unsupported governance scenario")
    exact_keys(
        scenario,
        {"schema", "title", "proposal", "policy", "controls", "votes"},
        "scenario",
    )
    proposal, policy = scenario["proposal"], scenario["policy"]
    exact_keys(proposal, {"id", "requestedCents", "availableCents"}, "proposal")
    exact_keys(
        policy,
        {"eligibleWeight", "quorumPercent", "approvalPercent", "requiredControls"},
        "policy",
    )
    if not isinstance(proposal, dict) or not isinstance(policy, dict):
        raise ValueError("proposal and policy must be objects")
    if not isinstance(proposal.get("id"), str) or not re.fullmatch(
        r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}", proposal["id"]
    ):
        raise ValueError("Proposal id must be a bounded identifier")
    if (
        not isinstance(scenario.get("title"), str)
        or not 1 <= len(scenario["title"]) <= 200
    ):
        raise ValueError("title must contain 1 to 200 characters")
    requested = integer(proposal["requestedCents"], "requestedCents", 1, 10**12)
    available = integer(proposal["availableCents"], "availableCents", 0, 10**12)
    eligible = integer(policy["eligibleWeight"], "eligibleWeight", 1, 10**9)
    quorum = integer(policy["quorumPercent"], "quorumPercent", 1, 100)
    threshold = integer(policy["approvalPercent"], "approvalPercent", 1, 100)
    votes = scenario["votes"]
    if not isinstance(votes, list) or len(votes) > 1000:
        raise ValueError("votes must be a bounded list")
    seen, cast, approved = set(), 0, 0
    for vote in votes:
        exact_keys(vote, {"voter", "weight", "choice"}, "vote")
        if not isinstance(vote, dict):
            raise ValueError("Each vote must be an object")
        voter = vote["voter"]
        if (
            not isinstance(voter, str)
            or not voter.strip()
            or len(voter) > 100
            or voter in seen
        ):
            raise ValueError("Voters must have unique nonempty identifiers")
        seen.add(voter)
        weight = integer(vote["weight"], "vote weight", 1, eligible)
        if vote["choice"] not in {"approve", "reject", "abstain"}:
            raise ValueError("Unknown vote choice")
        cast += weight
        approved += weight if vote["choice"] == "approve" else 0
    if cast > eligible:
        raise ValueError("Cast weight exceeds eligible weight")
    controls, required = scenario["controls"], policy["requiredControls"]
    for items in [controls, required]:
        if (
            not isinstance(items, list)
            or not items
            or len(items) > 30
            or any(
                not isinstance(x, str)
                or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}", x)
                for x in items
            )
            or len(set(items)) != len(items)
        ):
            raise ValueError("Control categories must be unique nonempty lists")
    missing = sorted(set(required) - set(controls))
    checks = {
        "quorum": cast * 100 >= eligible * quorum,
        "approval": cast > 0 and approved * 100 >= cast * threshold,
        "budget": requested <= available,
        "ownerControls": not missing,
    }
    # Reuse the established governance engine for diagnostic owner-control coverage.
    # Its model metrics are illustrative and are not real-world energy measurements.
    spec = importlib.util.spec_from_file_location("agijobs_governance_engine", ENGINE)
    engine = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = engine
    spec.loader.exec_module(engine)
    mission = engine.Mission.from_payload(
        {
            "meta": {"title": str(scenario.get("title", "Governance rehearsal"))},
            "ownerControls": {
                "requiredCategories": required,
                "criticalCapabilities": [{"category": item} for item in controls],
            },
            "gameTheory": {
                "strategies": [
                    {"initialShare": approved},
                    {"initialShare": cast - approved},
                ]
            },
        }
    )
    metrics = engine.compute_governance_metrics(mission)
    return {
        "schema": "agijobs.governance-rehearsal-result.v1",
        "mode": "offline-simulation",
        "proposalId": proposal["id"],
        "accepted": all(checks.values()),
        "checks": checks,
        "reasons": [name for name, passed in checks.items() if not passed],
        "castWeight": cast,
        "approvedWeight": approved,
        "requestedCents": requested,
        "remainingCentsIfApproved": (
            available - requested if all(checks.values()) else available
        ),
        "missingControls": metrics["missing_owner_categories"],
        "enacted": False,
        "settlementApproved": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scenario", type=Path, default=Path(__file__).with_name("scenario.json")
    )
    args = parser.parse_args()
    with args.scenario.open("rb") as source:
        raw = source.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError("Scenario exceeds 1 MB")
    result = evaluate(parse_scenario(raw))
    result["scenarioSha256"] = hashlib.sha256(raw).hexdigest()
    print(json.dumps(result, indent=2))
    return 0 if result["accepted"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(f"Invalid scenario: {error}", file=sys.stderr)
        raise SystemExit(2)
