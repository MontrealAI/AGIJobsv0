"""Bounded infrastructure capacity rehearsal using the existing reservation engine."""

from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
ENGINE = (
    ROOT
    / "demo/Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo/resources.py"
)


def exact(value, keys, name):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError(f"{name} has missing or unknown fields")


def integer(value, name, maximum=1000000):
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError(f"{name} must be an integer from 0 to {maximum}")
    return value


def parse_scenario(raw):
    if len(raw) > 1000000:
        raise ValueError("Scenario exceeds 1 MB")

    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    def reject(value):
        raise ValueError(f"Non-finite number: {value}")

    return json.loads(
        raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=reject
    )


def evaluate(scenario):
    exact(
        scenario,
        [
            "schema",
            "title",
            "normalCapacity",
            "outageCapacity",
            "protectedReserve",
            "jobs",
        ],
        "scenario",
    )
    if scenario["schema"] != "agijobs.celestial-resource-contingency.v1":
        raise ValueError("Unsupported scenario schema")
    if (
        not isinstance(scenario["title"], str)
        or not scenario["title"].strip()
        or len(scenario["title"]) > 200
    ):
        raise ValueError("Title must contain 1 to 200 characters")
    dimensions = ["energyUnits", "computeUnits"]
    for field in ["normalCapacity", "outageCapacity", "protectedReserve"]:
        exact(scenario[field], dimensions, field)
        for dim in dimensions:
            integer(scenario[field][dim], f"{field}.{dim}")
    for dim in dimensions:
        if scenario["outageCapacity"][dim] > scenario["normalCapacity"][dim]:
            raise ValueError("Outage capacity cannot exceed normal capacity")
        if scenario["protectedReserve"][dim] > scenario["normalCapacity"][dim]:
            raise ValueError("Protected reserve cannot exceed normal capacity")
    jobs = scenario["jobs"]
    if not isinstance(jobs, list) or not 1 <= len(jobs) <= 50:
        raise ValueError("Supply 1 to 50 infrastructure jobs")
    seen = set()
    for job in jobs:
        exact(job, ["id", "label", "priority", *dimensions], "job")
        if (
            not isinstance(job["id"], str)
            or not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", job["id"])
            or job["id"] in seen
        ):
            raise ValueError(
                "Job identifiers must be unique bounded lowercase identifiers"
            )
        seen.add(job["id"])
        if (
            not isinstance(job["label"], str)
            or not job["label"].strip()
            or len(job["label"]) > 100
        ):
            raise ValueError("Job labels must contain 1 to 100 characters")
        integer(job["priority"], "priority", 100)
        for dim in dimensions:
            integer(job[dim], dim)
        if job["energyUnits"] + job["computeUnits"] == 0:
            raise ValueError("Each job must request at least one resource unit")
    spec = importlib.util.spec_from_file_location(
        "celestial_existing_resources", ENGINE
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    ordered = sorted(enumerate(jobs), key=lambda item: (-item[1]["priority"], item[0]))

    def allocate(capacity):
        manager = module.ResourceManager(
            capacity["energyUnits"], capacity["computeUnits"], 0
        )
        held = {
            d: min(capacity[d], scenario["protectedReserve"][d]) for d in dimensions
        }
        shortfall = {d: scenario["protectedReserve"][d] - held[d] for d in dimensions}
        manager.reserve_budget(
            "__protected__", energy=held["energyUnits"], compute=held["computeUnits"]
        )
        rows = []
        for _, job in ordered:
            reasons = []
            if any(shortfall.values()):
                reasons.append("protected-reserve-shortfall")
            else:
                if job["energyUnits"] > manager.energy_available:
                    reasons.append("energy-capacity")
                if job["computeUnits"] > manager.compute_available:
                    reasons.append("compute-capacity")
            if not reasons:
                manager.reserve_budget(
                    job["id"], energy=job["energyUnits"], compute=job["computeUnits"]
                )
            rows.append(
                {
                    "id": job["id"],
                    "label": job["label"],
                    "priority": job["priority"],
                    "status": "deferred" if reasons else "reserved",
                    "reasons": reasons,
                    **{d: job[d] for d in dimensions},
                }
            )
        remaining = {
            "energyUnits": int(manager.energy_available),
            "computeUnits": int(manager.compute_available),
        }
        allocated = {
            d: sum(row[d] for row in rows if row["status"] == "reserved")
            for d in dimensions
        }
        conserved = all(
            capacity[d] == held[d] + allocated[d] + remaining[d] for d in dimensions
        )
        if not conserved:
            raise RuntimeError("Resource conservation check failed")
        return {
            "capacity": dict(capacity),
            "reserveHeld": held,
            "reserveShortfall": shortfall,
            "dispatchPaused": any(shortfall.values()),
            "jobs": rows,
            "allocated": allocated,
            "remaining": remaining,
            "conserved": conserved,
        }

    normal, outage = allocate(scenario["normalCapacity"]), allocate(
        scenario["outageCapacity"]
    )
    selected = lambda phase: [
        row["id"] for row in phase["jobs"] if row["status"] == "reserved"
    ]
    before, after = selected(normal), selected(outage)
    return {
        "schema": "agijobs.celestial-resource-result.v1",
        "title": scenario["title"],
        "normal": normal,
        "outage": outage,
        "displacedIds": [i for i in before if i not in after],
        "newlySelectedIds": [i for i in after if i not in before],
        "allocationOrder": [job["id"] for _, job in ordered],
        "assumptions": [
            "Higher priority first; ties preserve input order.",
            "Jobs are indivisible; greedy selection is not a global optimizer.",
            "Plans are independent snapshots; displaced means a changed plan, not an actual cancellation.",
            "Resource units are declared planning units, not measured physical capacity.",
        ],
        "executionAttested": False,
        "productionApproved": False,
        "settlementApproved": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "scenario",
        nargs="?",
        type=Path,
        default=Path(__file__).with_name("scenario.json"),
    )
    args = parser.parse_args()
    try:
        with args.scenario.open("rb") as source:
            raw = source.read(1000001)
        result = evaluate(parse_scenario(raw))
        result["scenarioSha256"] = hashlib.sha256(raw).hexdigest()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 1 if result["outage"]["dispatchPaused"] else 0
    except (ValueError, OSError, RecursionError) as error:
        print(f"Cannot plan resource contingency: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
