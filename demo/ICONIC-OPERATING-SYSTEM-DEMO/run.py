"""Inspect supplier deliverables and reported execution budgets; never admit or settle work."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / "demo/One-Box/computer-work/task.json"
REVIEW = ROOT / "demo/One-Box/computer-work/review.cjs"


def exact(value, keys, name):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError(f'{name} must contain exactly {", ".join(sorted(keys))}')


def integer(value, name, maximum=10**12):
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError(f"{name} must be a nonnegative bounded integer")
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
        raise ValueError(f"Nonfinite JSON value: {value}")

    return json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw, object_pairs_hook=pairs, parse_constant=nonfinite)


def evaluate(packet):
    exact(
        packet,
        {
            "schema",
            "taskSourceSha256",
            "receipt",
            "execution",
            "usage",
            "policy",
            "productionApproved",
            "settlementApproved",
        },
        "packet",
    )
    if packet["schema"] != "agijobs.supplier-evidence-desk.v1":
        raise ValueError("Unsupported evidence packet")
    if not isinstance(packet["taskSourceSha256"], str) or not re.fullmatch(
        "[0-9a-f]{64}", packet["taskSourceSha256"]
    ):
        raise ValueError("taskSourceSha256 must be a lowercase SHA-256 digest")
    if (
        type(packet["productionApproved"]) is not bool
        or type(packet["settlementApproved"]) is not bool
    ):
        raise ValueError("Authority flags must be booleans")
    receipt = packet["receipt"]
    exact(receipt, {"artifacts"}, "receipt")
    files = receipt["artifacts"]
    if not isinstance(files, list) or len(files) != 2:
        raise ValueError("Provide exactly two bounded deliverables")
    for file in files:
        if not isinstance(file, dict) or set(file) not in [
            {"name", "content", "sha256"},
            {"name", "content", "sha256", "mediaType"},
        ]:
            raise ValueError("Unexpected artifact fields")
        if not isinstance(file["name"], str) or not re.fullmatch(
            "[A-Za-z0-9_.-]{1,80}", file["name"]
        ):
            raise ValueError("Invalid artifact name")
        if (
            not isinstance(file["content"], str)
            or len(file["content"].encode("utf-8")) > 200_000
        ):
            raise ValueError("Artifact content must be at most 200 KB UTF-8")
        if not isinstance(file["sha256"], str) or not re.fullmatch(
            "[0-9a-f]{64}", file["sha256"]
        ):
            raise ValueError("Artifact SHA-256 must be lowercase hex")
        if "mediaType" in file and (
            not isinstance(file["mediaType"], str) or len(file["mediaType"]) > 100
        ):
            raise ValueError("Invalid media type")
        if file["name"] == "comparison.json":
            report = parse(file["content"])
            if (
                not isinstance(report, dict)
                or not isinstance(report.get("quotes"), list)
                or any(not isinstance(q, dict) for q in report["quotes"])
            ):
                raise ValueError("Comparison must contain an array of quote objects")
    if sorted(file["name"] for file in files) != [
        "comparison.json",
        "recommendation.md",
    ]:
        raise ValueError(
            "Provide each expected artifact exactly once: comparison.json and recommendation.md"
        )
    execution, usage, policy = packet["execution"], packet["usage"], packet["policy"]
    exact(
        execution,
        {
            "mode",
            "providerCalls",
            "browserObserved",
            "externalFetches",
            "workerTerminated",
        },
        "execution",
    )
    if execution["mode"] not in ["scripted-browser-lab", "reported-live-provider"]:
        raise ValueError("Unsupported execution mode")
    for key in ["providerCalls", "externalFetches"]:
        integer(execution[key], key, 100000)
    for key in ["browserObserved", "workerTerminated"]:
        if type(execution[key]) is not bool:
            raise ValueError(f"{key} must be a boolean")
    exact(usage, {"inputTokens", "outputTokens", "reportedCostMicrousd"}, "usage")
    for key, value in usage.items():
        if value is not None:
            integer(value, key)
    exact(
        policy,
        {
            "maximumCalls",
            "maximumInputTokens",
            "maximumOutputTokens",
            "maximumCostMicrousd",
        },
        "policy",
    )
    for key, value in policy.items():
        integer(value, key)
    completed = subprocess.run(
        [
            "node",
            "-e",
            "const fs=require('fs'); const {review}=require(process.argv[1]); console.log(JSON.stringify(review(JSON.parse(fs.readFileSync(0,'utf8')))));",
            str(REVIEW),
        ],
        input=json.dumps(receipt),
        text=True,
        capture_output=True,
        timeout=5,
        check=True,
    )
    review = json.loads(completed.stdout)
    usage_known = all(value is not None for value in usage.values())
    checks = {
        "artifactAcceptance": review["accepted"],
        "taskIdentity": packet["taskSourceSha256"]
        == hashlib.sha256(TASK.read_bytes()).hexdigest(),
        "browserObservationReported": execution["browserObserved"],
        "cleanupReported": execution["workerTerminated"],
        "zeroExternalFetchesReported": execution["externalFetches"] == 0,
        "callsWithinPolicy": execution["providerCalls"] <= policy["maximumCalls"],
        "usageKnown": usage_known,
        "inputWithinPolicy": usage["inputTokens"] is not None
        and usage["inputTokens"] <= policy["maximumInputTokens"],
        "outputWithinPolicy": usage["outputTokens"] is not None
        and usage["outputTokens"] <= policy["maximumOutputTokens"],
        "reportedCostWithinPolicy": usage["reportedCostMicrousd"] is not None
        and usage["reportedCostMicrousd"] <= policy["maximumCostMicrousd"],
        "authorityClaimsAbsent": not packet["productionApproved"]
        and not packet["settlementApproved"],
    }
    return {
        "schema": "agijobs.supplier-evidence-desk-result.v1",
        "mode": "offline-evidence-review",
        "packetComplete": all(checks.values()),
        "artifactReview": review,
        "checks": checks,
        "unresolvedGates": [key for key, value in checks.items() if not value],
        "executionMode": execution["mode"],
        "usage": dict(usage),
        "policy": dict(policy),
        "taskSourceSha256": hashlib.sha256(TASK.read_bytes()).hexdigest(),
        "artifactCommitments": [
            {
                "name": f["name"],
                "sha256": hashlib.sha256(f["content"].encode()).hexdigest(),
            }
            for f in files
        ],
        "executionAttested": False,
        "costAttested": False,
        "admitted": False,
        "settlementApproved": False,
        "productionApproved": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--packet", type=Path, default=Path(__file__).with_name("packet.json")
    )
    args = parser.parse_args()
    with args.packet.open("rb") as handle:
        raw = handle.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError("Packet exceeds 1 MB")
    result = evaluate(parse(raw))
    result["packetSha256"] = hashlib.sha256(raw).hexdigest()
    print(json.dumps(result, indent=2))
    return 0 if result["packetComplete"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (
        ValueError,
        TypeError,
        KeyError,
        OSError,
        RecursionError,
        subprocess.SubprocessError,
    ) as error:
        print(f"Invalid evidence packet: {error}", file=sys.stderr)
        raise SystemExit(2)
