"""Utilities for creating human-friendly output artefacts."""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from functools import lru_cache
from html import escape
from pathlib import Path
from typing import Dict, Iterable

from .entities import DemoRunArtifacts, OwnerAction


@dataclass
class ReportBundle:
    """File paths generated when exporting a demo run."""

    json_path: Path
    html_path: Path


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>{title}</title>
  <style>
    body {{ font-family: 'Inter', Arial, sans-serif; background:#05071a; color:#f5f9ff; margin:0; padding:2rem; }}
    h1, h2 {{ color:#7df9ff; }}
    section {{ margin-bottom:2rem; background:rgba(255,255,255,0.04); padding:1.5rem; border-radius:18px; box-shadow:0 12px 42px rgba(0,0,0,0.45); }}
    table {{ width:100%; border-collapse: collapse; margin-top:1rem; }}
    th, td {{ text-align:left; padding:0.75rem; border-bottom:1px solid rgba(255,255,255,0.1); }}
    .badge {{ display:inline-block; padding:0.35rem 0.75rem; border-radius:999px; background:linear-gradient(90deg,#00d1ff,#a855f7); color:#05071a; font-weight:600; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:1rem; }}
    .mermaid {{ margin-top:1rem; border-radius:16px; background:rgba(0,0,0,0.35); padding:1.25rem; }}
    .note {{ font-size:0.9rem; color:#b3c7f9; }}
  </style>
  <script>{mermaid_js}</script>
  <script>mermaid.initialize({{ startOnLoad: true, theme: "dark", securityLevel: "strict" }});</script>
</head>
<body>
  <h1>Meta-Agentic Program Synthesis</h1>
  <section>
    <h2>Mission Summary</h2>
    <p class=\"badge\">Scenario: {scenario}</p>
    <p>Final winning program: <strong>{program}</strong></p>
    <p>Composite fitness score: <strong>{score:.4f}</strong></p>
    <p>Improvement vs first generation: <strong>{improvement:.4f}</strong></p>
    <p>First success generation: <strong>{first_success}</strong></p>
  </section>
  <section>
    <h2>Architecture Atlas</h2>
    <p class=\"note\">Live architecture graph distilled from this run.</p>
    <div class=\"mermaid\">{architecture_mermaid}</div>
  </section>
  <section>
    <h2>Evolution Timeline</h2>
    <div class=\"mermaid\">{timeline_mermaid}</div>
  </section>
  <section>
    <h2>Owner Command Ledger</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Timestamp</th><th>Action</th><th>Parameters</th></tr>
      </thead>
      <tbody>
        {owner_rows}
      </tbody>
    </table>
  </section>
  <section>
    <h2>Governance Timelock</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Action</th><th>ETA</th><th>Status</th><th>Payload</th></tr>
      </thead>
      <tbody>
        {timelock_rows}
      </tbody>
    </table>
  </section>
  <section>
    <h2>Evolutionary Trajectory</h2>
    <table>
      <thead>
        <tr><th>Generation</th><th>Best Score</th><th>Δ vs prev</th><th>Average Score</th><th>Variance</th><th>Notes</th></tr>
      </thead>
      <tbody>
        {evolution_rows}
      </tbody>
    </table>
  </section>
  <section>
    <h2>On-Chain Jobs</h2>
    <table>
      <thead>
        <tr><th>Job</th><th>Status</th><th>Reward</th><th>Commitment</th></tr>
      </thead>
      <tbody>
        {job_rows}
      </tbody>
    </table>
  </section>
  <section>
    <h2>Thermodynamic Reward Flow</h2>
    <div class=\"mermaid\">{reward_mermaid}</div>
    {reward_tables}
  </section>
  <section>
    <h2>Agent Telemetry</h2>
    <div class=\"grid\">
      {performance_cards}
    </div>
  </section>
</body>
</html>
"""


def build_rows(items: Iterable[str]) -> str:
    return "".join(items)


def mermaid_escape(value: str) -> str:
    return value.replace("\"", "\\\"").replace("\n", " ")


@lru_cache()
def load_mermaid_js() -> str:
    path = Path(__file__).with_name("static").joinpath("mermaid.min.js")
    return path.read_text(encoding="utf-8")


def format_owner_rows(actions: Iterable[OwnerAction]) -> str:
    entries = list(actions)
    if not entries:
        return "<tr><td colspan=4>No owner interventions were required.</td></tr>"
    return build_rows(
        f"<tr><td>{index}</td><td>{escape(action.timestamp.isoformat())}</td>"
        f"<td>{escape(action.action)}</td><td>{escape(json.dumps(action.payload, sort_keys=True))}</td></tr>"
        for index, action in enumerate(entries, start=1)
    )


def format_timelock_rows(actions: Iterable[object]) -> str:
    entries = list(actions)
    if not entries:
        return "<tr><td colspan=5>No timelocked actions were scheduled.</td></tr>"
    return build_rows(
        f"<tr><td>{index}</td><td>{escape(action.name)}</td>"
        f"<td>{escape(action.eta.isoformat(timespec='seconds'))}</td>"
        f"<td>{escape(action.status)}</td>"
        f"<td>{escape(json.dumps(dict(action.payload), sort_keys=True))}</td></tr>"
        for index, action in enumerate(entries, start=1)
    )


def format_evolution_rows(report: DemoRunArtifacts) -> str:
    return build_rows(
        f"<tr><td>{record.generation}</td><td>{record.best_score:.4f}</td>"
        f"<td>{'—' if record.best_score_delta is None else f'{record.best_score_delta:+.4f}'}</td>"
        f"<td>{record.average_score:.4f}</td><td>{record.score_variance:.6f}</td><td>{escape(record.notes)}</td></tr>"
        for record in report.evolution
    )


def format_job_rows(report: DemoRunArtifacts) -> str:
    return build_rows(
        f"<tr><td>{escape(job.title)}</td><td>{job.status.name}</td><td>{job.reward:.1f}</td>"
        f"<td>{job.result_commit or '—'}</td></tr>"
        for job in report.jobs
    )


def format_reward_tables(report: DemoRunArtifacts) -> str:
    return build_rows(
        "<table><thead><tr><th colspan=2>Job #{job_id}</th></tr></thead><tbody>"
        f"<tr><td>Total</td><td>{breakdown.total_reward:.2f}</td></tr>"
        + "".join(
            f"<tr><td>Solver {escape(address)}</td><td>{amount:.2f} (energy {breakdown.solver_energy.get(address, 0.0):.1f})</td></tr>"
            for address, amount in breakdown.solver_rewards.items()
        )
        + "".join(
            f"<tr><td>Validator {escape(address)}</td><td>{amount:.2f} (energy {breakdown.validator_energy.get(address, 0.0):.1f})</td></tr>"
            for address, amount in breakdown.validator_rewards.items()
        )
        + f"<tr><td>Architect</td><td>{breakdown.architect_reward:.2f}</td></tr></tbody></table>"
        for job_id, breakdown in ((reward.job_id, reward) for reward in report.rewards)
    )


def format_performance_cards(report: DemoRunArtifacts) -> str:
    return build_rows(
        f"<section><h3>{escape(perf.address)}</h3><p>Stake before: {perf.stake_before:.2f}</p>"
        f"<p>Stake after: {perf.stake_after:.2f}</p><p>Energy logged: {perf.energy:.1f}</p>"
        f"<p>Rewards earned: {perf.score:.2f}</p></section>"
        for perf in report.performances
    )


def collect_reward_totals(report: DemoRunArtifacts) -> tuple[Dict[str, float], Dict[str, float], float, float]:
    solver_totals: Dict[str, float] = defaultdict(float)
    validator_totals: Dict[str, float] = defaultdict(float)
    total_reward = 0.0
    architect_total = 0.0
    for breakdown in report.rewards:
        total_reward += breakdown.total_reward
        architect_total += breakdown.architect_reward
        for address, amount in breakdown.solver_rewards.items():
            solver_totals[address] += amount
        for address, amount in breakdown.validator_rewards.items():
            validator_totals[address] += amount
    return solver_totals, validator_totals, total_reward, architect_total


def build_architecture_mermaid(report: DemoRunArtifacts) -> str:
    solver_addresses = sorted({address for reward in report.rewards for address in reward.solver_rewards})
    validator_addresses = sorted({address for reward in report.rewards for address in reward.validator_rewards})
    lines = [
        "flowchart LR",
        "    user((Non-technical Visionary))",
        "    owner{{Owner Console}}",
        "    architect[Sovereign Architect]",
        f"    jobs[Jobs Posted ({len(report.jobs)})]",
        f"    solvers[Execution Nodes ({len(solver_addresses) or 0})]",
        f"    validators[Validator Council ({len(validator_addresses) or 0})]",
        "    rewards[[Thermodynamic Reward Engine]]",
        "    user --> architect",
        "    owner --> architect",
        "    architect --> jobs",
        "    jobs --> solvers",
        "    jobs --> validators",
        "    solvers --> rewards",
        "    validators --> rewards",
        "    rewards --> user",
    ]
    if report.owner_actions:
        lines.append(f"    owner -. {len(report.owner_actions)} interventions .-> architect")
    return "\n".join(lines)


def build_timeline_mermaid(report: DemoRunArtifacts) -> str:
    lines = ["timeline", "    title Evolution Performance", "    section Generations"]
    for record in report.evolution:
        delta = "—" if record.best_score_delta is None else f"{record.best_score_delta:+.4f}"
        lines.append(
            f"      Generation {record.generation} : Score {record.best_score:.4f} (Δ {delta})"
        )
    return "\n".join(lines)


def build_reward_mermaid(report: DemoRunArtifacts) -> str:
    solver_totals, validator_totals, total_reward, architect_total = collect_reward_totals(report)
    lines = [
        "graph TD",
        f"    pool[\"Reward Pool {total_reward:.2f}\"]",
        f"    pool --> architectShare[\"Architect {architect_total:.2f}\"]",
    ]
    if solver_totals:
        lines.append("    pool --> solvers[Solvers]")
        for index, (address, amount) in enumerate(sorted(solver_totals.items()), start=1):
            safe_id = f"solver{index}"
            label = mermaid_escape(f"{address} ({amount:.2f})")
            lines.append(f"    solvers --> {safe_id}[\"{label}\"]")
    if validator_totals:
        lines.append("    pool --> validators[Validators]")
        for index, (address, amount) in enumerate(sorted(validator_totals.items()), start=1):
            safe_id = f"validator{index}"
            label = mermaid_escape(f"{address} ({amount:.2f})")
            lines.append(f"    validators --> {safe_id}[\"{label}\"]")
    return "\n".join(lines)


def render_html(report: DemoRunArtifacts) -> str:
    owner_rows = format_owner_rows(report.owner_actions)
    timelock_rows = format_timelock_rows(report.timelock_actions)
    evolution_rows = format_evolution_rows(report)
    job_rows = format_job_rows(report)
    reward_tables = format_reward_tables(report)
    performance_cards = format_performance_cards(report)
    architecture_mermaid = build_architecture_mermaid(report)
    timeline_mermaid = build_timeline_mermaid(report)
    reward_mermaid = build_reward_mermaid(report)
    first_success = (
        report.first_success_generation if report.first_success_generation is not None else "Not reached"
    )
    return HTML_TEMPLATE.format(
        title="Meta-Agentic Program Synthesis Report",
        scenario=escape(report.scenario),
        program=escape(report.final_program),
        score=report.final_score,
        improvement=report.improvement_over_first,
        first_success=first_success,
        owner_rows=owner_rows,
        timelock_rows=timelock_rows,
        evolution_rows=evolution_rows,
        job_rows=job_rows,
        reward_tables=reward_tables,
        performance_cards=performance_cards,
        architecture_mermaid=architecture_mermaid,
        timeline_mermaid=timeline_mermaid,
        reward_mermaid=reward_mermaid,
        mermaid_js=load_mermaid_js(),
    )


def export_report(report: DemoRunArtifacts, output_dir: Path) -> ReportBundle:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "report.json"
    html_path = output_dir / "report.html"
    json_path.write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    return ReportBundle(json_path=json_path, html_path=html_path)


__all__ = ["export_report", "render_html", "ReportBundle", "load_mermaid_js"]
