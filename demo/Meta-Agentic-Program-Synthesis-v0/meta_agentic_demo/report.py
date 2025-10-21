"""Utilities for creating human-friendly output artefacts."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .entities import DemoRunArtifacts


@dataclass
class ReportBundle:
    """File paths generated when exporting a demo run."""

    json_path: Path
    html_path: Path


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    body {{ font-family: 'Inter', Arial, sans-serif; background:#05071a; color:#f5f9ff; margin:0; padding:2rem; }}
    h1, h2 {{ color:#7df9ff; }}
    section {{ margin-bottom:2rem; background:rgba(255,255,255,0.04); padding:1.5rem; border-radius:18px; box-shadow:0 12px 42px rgba(0,0,0,0.45); }}
    table {{ width:100%; border-collapse: collapse; margin-top:1rem; }}
    th, td {{ text-align:left; padding:0.75rem; border-bottom:1px solid rgba(255,255,255,0.1); }}
    .badge {{ display:inline-block; padding:0.35rem 0.75rem; border-radius:999px; background:linear-gradient(90deg,#00d1ff,#a855f7); color:#05071a; font-weight:600; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:1rem; }}
  </style>
</head>
<body>
  <h1>Meta-Agentic Program Synthesis</h1>
  <section>
    <h2>Mission Summary</h2>
    <p class="badge">Scenario: {scenario}</p>
    <p>Final winning program: <strong>{program}</strong></p>
    <p>Composite fitness score: <strong>{score:.4f}</strong></p>
  </section>
  <section>
    <h2>Evolutionary Trajectory</h2>
    <table>
      <thead>
        <tr><th>Generation</th><th>Best Score</th><th>Average Score</th><th>Notes</th></tr>
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
    <h2>Thermodynamic Rewards</h2>
    {reward_tables}
  </section>
  <section>
    <h2>Agent Telemetry</h2>
    <div class="grid">
      {performance_cards}
    </div>
  </section>
</body>
</html>
"""


def build_rows(items: Iterable[str]) -> str:
    return "".join(items)


def render_html(report: DemoRunArtifacts) -> str:
    evolution_rows = build_rows(
        f"<tr><td>{record.generation}</td><td>{record.best_score:.4f}</td>"
        f"<td>{record.average_score:.4f}</td><td>{record.notes}</td></tr>"
        for record in report.evolution
    )
    job_rows = build_rows(
        f"<tr><td>{job.title}</td><td>{job.status.name}</td><td>{job.reward:.1f}</td>"
        f"<td>{job.result_commit or '—'}</td></tr>"
        for job in report.jobs
    )
    reward_tables = build_rows(
        "<table><thead><tr><th colspan=2>Job #{job_id}</th></tr></thead><tbody>"
        f"<tr><td>Total</td><td>{breakdown.total_reward:.2f}</td></tr>"
        + "".join(
            f"<tr><td>Solver {address}</td><td>{amount:.2f} (energy {breakdown.solver_energy.get(address, 0.0):.1f})</td></tr>"
            for address, amount in breakdown.solver_rewards.items()
        )
        + "".join(
            f"<tr><td>Validator {address}</td><td>{amount:.2f} (energy {breakdown.validator_energy.get(address, 0.0):.1f})</td></tr>"
            for address, amount in breakdown.validator_rewards.items()
        )
        + f"<tr><td>Architect</td><td>{breakdown.architect_reward:.2f}</td></tr></tbody></table>"
        for job_id, breakdown in ((reward.job_id, reward) for reward in report.rewards)
    )
    performance_cards = build_rows(
        f"<section><h3>{perf.address}</h3><p>Stake before: {perf.stake_before:.2f}</p>"
        f"<p>Stake after: {perf.stake_after:.2f}</p><p>Energy logged: {perf.energy:.1f}</p>"
        f"<p>Rewards earned: {perf.score:.2f}</p></section>"
        for perf in report.performances
    )
    return HTML_TEMPLATE.format(
        title="Meta-Agentic Program Synthesis Report",
        scenario=report.scenario,
        program=report.final_program,
        score=report.final_score,
        evolution_rows=evolution_rows,
        job_rows=job_rows,
        reward_tables=reward_tables,
        performance_cards=performance_cards,
    )


def export_report(report: DemoRunArtifacts, output_dir: Path) -> ReportBundle:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "report.json"
    html_path = output_dir / "report.html"
    json_path.write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    return ReportBundle(json_path=json_path, html_path=html_path)


__all__ = ["export_report", "render_html", "ReportBundle"]
