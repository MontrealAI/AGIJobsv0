"""Generate Astral Citadel mission readiness ledgers.

This script ingests the curated project plan and synthesises
human-friendly and machine-readable artefacts so operators can
validate the Astral Citadel experience locally. It intentionally
keeps dependencies minimal to stay runnable in constrained CI
agents.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple


@dataclass
class ThermodynamicProfile:
    expected_entropy: float
    adjustment_on_delay: str

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "ThermodynamicProfile":
        return cls(
            expected_entropy=float(data.get("expectedEntropy", 0.0)),
            adjustment_on_delay=str(data.get("adjustmentOnDelay", "")),
        )


@dataclass
class Job:
    identifier: str
    title: str
    reward: float
    deadline_days: int
    dependencies: List[str]
    energy_budget: float
    thermo: ThermodynamicProfile

    @classmethod
    def from_dict(cls, payload: Dict[str, object]) -> "Job":
        return cls(
            identifier=str(payload["id"]),
            title=str(payload["title"]),
            reward=float(payload["reward"]),
            deadline_days=int(payload["deadlineDays"]),
            dependencies=[str(dep) for dep in payload.get("dependencies", [])],
            energy_budget=float(payload["energyBudget"]),
            thermo=ThermodynamicProfile.from_dict(
                payload.get("thermodynamicProfile", {})
            ),
        )

    @property
    def normalized_reward(self) -> float:
        return self.reward / max(self.deadline_days, 1)

    @property
    def gibbs_margin(self) -> float:
        # A lightweight thermodynamic sanity metric that prefers low entropy
        # relative to the allocated energy. Negative margins flag jobs that need
        # more stringent oversight.
        return self.energy_budget * (1.0 - self.thermo.expected_entropy)


@dataclass
class Plan:
    initiative: str
    objective: str
    budget_total: float
    jobs: List[Job]
    thermostat: Dict[str, str]
    governance: Dict[str, str]

    @classmethod
    def from_dict(cls, payload: Dict[str, object]) -> "Plan":
        governance = payload.get("governance", {})
        thermostat = governance.get("thermostat", {})
        return cls(
            initiative=str(payload.get("initiative", "")),
            objective=str(payload.get("objective", "")),
            budget_total=float(payload.get("budget", {}).get("total", 0)),
            jobs=[Job.from_dict(job) for job in payload.get("jobs", [])],
            thermostat={
                "initial": str(thermostat.get("initialTemperature", "")),
                "emergency": str(thermostat.get("emergencyTemperature", "")),
                "updateScript": str(thermostat.get("updateScript", "")),
            },
            governance={
                "owner": str(governance.get("owner", "")),
                "treasury": str(governance.get("treasury", "")),
                "pauseAuthority": str(governance.get("pauseAuthority", "")),
            },
        )

    @property
    def energy_budget(self) -> float:
        return sum(job.energy_budget for job in self.jobs)

    @property
    def validator_weight(self) -> float:
        # A placeholder Hamiltonian-inspired weighting that emphasises
        # validator-backed stability relative to energy consumption.
        entropy_pressure = sum(job.thermo.expected_entropy for job in self.jobs)
        if not self.jobs:
            return 0.0
        return max(0.0, 1.0 - entropy_pressure / len(self.jobs))


def topological_order(jobs: Iterable[Job]) -> List[Job]:
    jobs_by_id = {job.identifier: job for job in jobs}
    pending: Set[str] = set(jobs_by_id.keys())
    resolved: Set[str] = set()
    ordered: List[Job] = []

    while pending:
        progressed = False
        for job_id in list(pending):
            deps = set(jobs_by_id[job_id].dependencies)
            if deps.issubset(resolved):
                ordered.append(jobs_by_id[job_id])
                resolved.add(job_id)
                pending.remove(job_id)
                progressed = True
        if not progressed:
            unresolved_pairs: List[Tuple[str, List[str]]] = [
                (job_id, sorted(set(jobs_by_id[job_id].dependencies) - resolved))
                for job_id in pending
            ]
            raise ValueError(
                "Cyclic or missing dependencies detected: "
                + "; ".join(
                    f"{job_id} waiting on {', '.join(missing)}"
                    for job_id, missing in unresolved_pairs
                )
            )
    return ordered


def summarise_jobs(jobs: List[Job]) -> Dict[str, object]:
    ordered_jobs = topological_order(jobs)
    return {
        "count": len(jobs),
        "ordered_ids": [job.identifier for job in ordered_jobs],
        "thermodynamics": {
            job.identifier: {
                "entropy": job.thermo.expected_entropy,
                "gibbs_margin": round(job.gibbs_margin, 2),
                "adjustment": job.thermo.adjustment_on_delay,
            }
            for job in ordered_jobs
        },
    }


def render_markdown(plan: Plan, jobs_summary: Dict[str, object]) -> str:
    lines = [
        f"# Astral Citadel Mission Readiness \n",
        f"**Initiative:** {plan.initiative}\n",
        f"**Objective:** {plan.objective}\n",
        "",
        "## Thermodynamic Guardrails",
        f"- Thermostat initial temperature: {plan.thermostat['initial']}",
        f"- Thermostat emergency temperature: {plan.thermostat['emergency']}",
        f"- Hamiltonian update script: `{plan.thermostat['updateScript']}`",
        f"- Validator stability weight (lower is riskier): {plan.validator_weight:.3f}\n",
        "## Job Lattice",
    ]
    for job_id in jobs_summary["ordered_ids"]:
        thermo = jobs_summary["thermodynamics"][job_id]
        lines.append(
            f"- **{job_id}** — entropy={thermo['entropy']:.3f}, "
            f"gibbs_margin={thermo['gibbs_margin']}, delay_adjustment={thermo['adjustment']}"
        )
    lines.extend(
        [
            "",
            "## Resource Snapshot",
            f"- Budget (AGIALPHA): {plan.budget_total:,.0f}",
            f"- Energy budget: {plan.energy_budget:,.0f}",
            f"- Normalised reward cadence: {sum(job.normalized_reward for job in plan.jobs):.2f}",
            "",
            "## Governance",
            f"- Owner: {plan.governance['owner']}",
            f"- Treasury: {plan.governance['treasury']}",
            f"- Pause authority: {plan.governance['pauseAuthority']}",
        ]
    )
    return "\n".join(lines) + "\n"


def write_artifacts(plan: Plan, output_dir: Path) -> Dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    jobs_summary = summarise_jobs(plan.jobs)
    markdown = render_markdown(plan, jobs_summary)

    md_path = output_dir / "astral-citadel-report.md"
    json_path = output_dir / "astral-citadel-report.json"

    md_path.write_text(markdown)
    json_path.write_text(
        json.dumps(
            {
                "initiative": plan.initiative,
                "objective": plan.objective,
                "budget": plan.budget_total,
                "energy_budget": plan.energy_budget,
                "validator_weight": plan.validator_weight,
                "jobs": jobs_summary,
            },
            indent=2,
        )
    )
    return {"markdown": md_path, "json": json_path}


def run(plan_path: Path, output_dir: Path) -> Dict[str, Path]:
    plan_data = json.loads(plan_path.read_text())
    plan = Plan.from_dict(plan_data)
    return write_artifacts(plan, output_dir)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Astral Citadel demo synthesiser")
    parser.add_argument(
        "--plan",
        type=Path,
        default=Path(__file__).with_name("project-plan.json"),
        help="Path to the Astral Citadel project plan JSON file.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("reports/astral-citadel"),
        help="Directory to write generated artefacts.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    artifacts = run(args.plan, args.output_dir)
    print("✅ Astral Citadel readiness artefacts generated:")
    for label, path in artifacts.items():
        print(f" - {label}: {path}")


if __name__ == "__main__":
    main()
