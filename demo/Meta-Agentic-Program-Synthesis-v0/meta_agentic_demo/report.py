"""Utilities for creating human-friendly output artefacts."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from html import escape
from pathlib import Path
from typing import Dict, Iterable, Mapping

from .config import DemoScenario
from .entities import DemoRunArtifacts, OwnerAction, RewardSummary, VerificationDigest


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
    .badge.pass {{ background:linear-gradient(90deg,#24ff8f,#1dd3b0); color:#01230f; }}
    .badge.alert {{ background:linear-gradient(90deg,#ff7b00,#ff3a3a); color:#1a0404; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:1rem; }}
    .summary-card {{ padding:1rem; border-radius:14px; background:linear-gradient(135deg,rgba(125,249,255,0.18),rgba(168,85,247,0.16)); box-shadow:0 18px 32px rgba(0,0,0,0.32); }}
    .summary-card h3 {{ margin-top:0; color:#ffffff; }}
    .summary-card p {{ margin:0.25rem 0; color:#dbe7ff; }}
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
    <h2>Multi-Angle Verification</h2>
    <p class=\"badge {verification_badge}\">{verification_status}</p>
    <div class=\"grid\">{verification_cards}</div>
    <div class=\"mermaid\">{verification_mermaid}</div>
    {verification_table}
  </section>
  <section>
    <h2>Opportunity Intelligence</h2>
    <p class=\"note\">Strategic ventures unlocked by this sovereign cycle.</p>
    <div class=\"grid\">{opportunity_cards}</div>
    <div class=\"mermaid\">{opportunity_mermaid}</div>
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
    <div class=\"grid\">
      {reward_summary_cards}
    </div>
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

BATCH_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>{title}</title>
  <style>
    body {{ font-family: 'Inter', Arial, sans-serif; background:#040714; color:#f5f9ff; margin:0; padding:2rem; }}
    h1, h2 {{ color:#9bf6ff; }}
    section {{ margin-bottom:2rem; background:rgba(255,255,255,0.04); padding:1.5rem; border-radius:18px; box-shadow:0 16px 40px rgba(0,0,0,0.45); }}
    table {{ width:100%; border-collapse: collapse; margin-top:1rem; }}
    th, td {{ text-align:left; padding:0.75rem; border-bottom:1px solid rgba(255,255,255,0.12); }}
    th {{ color:#7df9ff; text-transform:uppercase; letter-spacing:0.05em; font-size:0.85rem; }}
    .badge {{ display:inline-block; padding:0.35rem 0.75rem; border-radius:999px; background:linear-gradient(90deg,#00c9ff,#92fe9d); color:#051d11; font-weight:600; margin-right:0.5rem; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:1rem; }}
    .summary-card {{ padding:1rem; border-radius:16px; background:linear-gradient(135deg,rgba(0,201,255,0.18),rgba(146,254,157,0.16)); box-shadow:0 14px 32px rgba(0,0,0,0.28); }}
    .summary-card h3 {{ margin:0; color:#ffffff; font-size:1.05rem; }}
    .summary-card p {{ margin:0.35rem 0 0; color:#dbe7ff; font-size:1.1rem; font-weight:600; }}
    .mermaid {{ margin-top:1rem; border-radius:16px; background:rgba(0,0,0,0.35); padding:1.25rem; }}
    a {{ color:#7df9ff; text-decoration:none; }}
    a:hover {{ text-decoration:underline; }}
  </style>
  <script>{mermaid_js}</script>
  <script>mermaid.initialize({{ startOnLoad: true, theme: "dark", securityLevel: "strict" }});</script>
</head>
<body>
  <h1>Meta-Agentic Mission Constellation</h1>
    <section>
    <h2>Constellation Overview</h2>
    <p>
      <span class=\"badge\">Missions: {scenario_count}</span>
      <span class=\"badge\">Pass rate: {pass_rate:.1f}%</span>
      <span class=\"badge\">Owner touchpoints: {owner_touchpoints}</span>
      <span class=\"badge\">Avg resilience: {average_resilience:.3f}</span>
    </p>
    <div class=\"grid\">{summary_cards}</div>
  </section>
  <section>
    <h2>Mission Ledger</h2>
    <table>
      <thead>
        <tr><th>Scenario</th><th>Composite Score</th><th>Δ vs Genesis</th><th>Entropy</th><th>Stress</th><th>Resilience</th><th>Verification</th><th>Top Solver</th></tr>
      </thead>
      <tbody>{table_rows}</tbody>
    </table>
  </section>
  <section>
    <h2>Meridian Flow</h2>
    <div class=\"mermaid\">{mermaid_graph}</div>
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


def _relative_path(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def _summarise_batch(reports: Mapping[str, DemoRunArtifacts]) -> Dict[str, object]:
    total = len(reports)
    if total == 0:
        return {
            "completed": 0,
            "pass_count": 0,
            "pass_rate": 0.0,
            "average_score": 0.0,
            "average_improvement": 0.0,
            "average_resilience": 0.0,
            "owner_touchpoints": 0,
            "best_identifier": None,
            "best_title": "—",
            "best_score": 0.0,
            "breakthrough_identifier": None,
            "breakthrough_title": "—",
            "breakthrough_improvement": 0.0,
            "entropy_identifier": None,
            "entropy_title": "—",
            "entropy_score": 0.0,
            "resilience_identifier": None,
            "resilience_title": "—",
            "resilience_score": 0.0,
        }
    pass_count = sum(1 for report in reports.values() if report.verification.overall_pass)
    total_score = sum(report.final_score for report in reports.values())
    total_improvement = sum(report.improvement_over_first for report in reports.values())
    total_resilience = sum(report.verification.resilience_index for report in reports.values())
    owner_actions = sum(len(report.owner_actions) for report in reports.values())
    timelock_actions = sum(len(report.timelock_actions) for report in reports.values())
    best_identifier, best_report = max(
        reports.items(), key=lambda item: item[1].final_score
    )
    breakthrough_identifier, breakthrough_report = max(
        reports.items(), key=lambda item: item[1].improvement_over_first
    )
    entropy_identifier, entropy_report = max(
        reports.items(), key=lambda item: item[1].verification.entropy_score
    )
    resilience_identifier, resilience_report = max(
        reports.items(), key=lambda item: item[1].verification.resilience_index
    )
    return {
        "completed": total,
        "pass_count": pass_count,
        "pass_rate": pass_count / total if total else 0.0,
        "average_score": total_score / total,
        "average_improvement": total_improvement / total,
        "average_resilience": total_resilience / total,
        "owner_touchpoints": owner_actions + timelock_actions,
        "best_identifier": best_identifier,
        "best_title": best_report.scenario,
        "best_score": best_report.final_score,
        "breakthrough_identifier": breakthrough_identifier,
        "breakthrough_title": breakthrough_report.scenario,
        "breakthrough_improvement": breakthrough_report.improvement_over_first,
        "entropy_identifier": entropy_identifier,
        "entropy_title": entropy_report.scenario,
        "entropy_score": entropy_report.verification.entropy_score,
        "resilience_identifier": resilience_identifier,
        "resilience_title": resilience_report.scenario,
        "resilience_score": resilience_report.verification.resilience_index,
    }


def _build_summary_cards(summary: Mapping[str, object]) -> str:
    if summary.get("completed", 0) == 0:
        return "<p>No missions executed.</p>"
    cards = [
        "<div class=\"summary-card\">"
        "<h3>Average Composite Score</h3>"
        f"<p>{float(summary['average_score']):.4f}</p>"
        "</div>",
        "<div class=\"summary-card\">"
        "<h3>Average Improvement</h3>"
        f"<p>{float(summary['average_improvement']):.4f}</p>"
        "</div>",
        "<div class=\"summary-card\">"
        "<h3>Average Resilience</h3>"
        f"<p>{float(summary['average_resilience']):.3f}</p>"
        "</div>",
        "<div class=\"summary-card\">"
        "<h3>Highest Score</h3>"
        f"<p>{escape(str(summary['best_title']))}<br/><span>{float(summary['best_score']):.4f}</span></p>"
        "</div>",
        "<div class=\"summary-card\">"
        "<h3>Strongest Breakthrough</h3>"
        f"<p>{escape(str(summary['breakthrough_title']))}<br/><span>Δ {float(summary['breakthrough_improvement']):.4f}</span></p>"
        "</div>",
        "<div class=\"summary-card\">"
        "<h3>Entropy Apex</h3>"
        f"<p>{escape(str(summary['entropy_title']))}<br/><span>{float(summary['entropy_score']):.3f}</span></p>"
        "</div>",
        "<div class=\"summary-card\">"
        "<h3>Resilience Apex</h3>"
        f"<p>{escape(str(summary['resilience_title']))}<br/><span>{float(summary['resilience_score']):.3f}</span></p>"
        "</div>",
    ]
    return build_rows(cards)


def _build_table_rows(
    items: Iterable[tuple[str, DemoRunArtifacts]],
    bundles: Mapping[str, ReportBundle],
    output_dir: Path,
    scenarios: Mapping[str, DemoScenario] | None,
) -> str:
    rows = []
    for identifier, report in items:
        bundle = bundles.get(identifier)
        link = _relative_path(bundle.html_path, output_dir) if bundle else "#"
        stress = 1.0
        if scenarios and identifier in scenarios:
            stress = max(scenarios[identifier].stress_multiplier, 0.0)
        solver = report.reward_summary.top_solver or "—"
        rows.append(
            "<tr>"
            f"<td><a href=\"{escape(link)}\">{escape(report.scenario)}</a></td>"
            f"<td>{report.final_score:.4f}</td>"
            f"<td>{report.improvement_over_first:.4f}</td>"
            f"<td>{report.verification.entropy_score:.3f}</td>"
            f"<td>{stress:.2f}×</td>"
            f"<td>{report.verification.resilience_index:.3f}</td>"
            f"<td>{'PASS' if report.verification.overall_pass else 'ATTENTION'}</td>"
            f"<td>{escape(solver)}</td>"
            "</tr>"
        )
    if not rows:
        return "<tr><td colspan=8>No missions executed.</td></tr>"
    return build_rows(rows)


def build_architecture_mermaid(report: DemoRunArtifacts) -> str:
    solver_addresses = sorted(report.reward_summary.solver_totals)
    validator_addresses = sorted(report.reward_summary.validator_totals)
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

def _build_mermaid_graph(
    items: Iterable[tuple[str, DemoRunArtifacts]],
    scenarios: Mapping[str, DemoScenario] | None,
) -> str:
    items = list(items)
    if not items:
        return "graph TD\n    A[No missions executed]"
    lines = ["flowchart LR"]
    node_names: list[str] = []
    for index, (identifier, report) in enumerate(items):
        node = f"S{index}"
        node_names.append(node)
        stress = (
            scenarios[identifier].stress_multiplier
            if scenarios and identifier in scenarios
            else 1.0
        )
        label = mermaid_escape(
            f"{report.scenario}\\nscore {report.final_score:.3f}\\nΔ {report.improvement_over_first:.3f}\\nstress {stress:.2f}×"
        )
        lines.append(f"    {node}[\"{label}\"]")
    for index in range(len(node_names) - 1):
        lines.append(f"    {node_names[index]} --> {node_names[index + 1]}")
    lines.append("    classDef pass fill:#16f2b3,stroke:#013220,color:#01230f;")
    lines.append("    classDef alert fill:#ff6f61,stroke:#7f1d1d,color:#1a0404;")
    for index, (_, report) in enumerate(items):
        css = "pass" if report.verification.overall_pass else "alert"
        lines.append(f"    class {node_names[index]} {css};")
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
    summary = report.reward_summary
    lines = [
        "graph TD",
        f"    pool[\"Reward Pool {summary.total_reward:.2f}\"]",
        f"    pool --> architectShare[\"Architect {summary.architect_total:.2f}\"]",
    ]
    if summary.solver_totals:
        lines.append("    pool --> solvers[Solvers]")
        for index, (address, amount) in enumerate(sorted(summary.solver_totals.items()), start=1):
            safe_id = f"solver{index}"
            label = mermaid_escape(f"{address} ({amount:.2f})")
            lines.append(f"    solvers --> {safe_id}[\"{label}\"]")
    if summary.validator_totals:
        lines.append("    pool --> validators[Validators]")
        for index, (address, amount) in enumerate(sorted(summary.validator_totals.items()), start=1):
            safe_id = f"validator{index}"
            label = mermaid_escape(f"{address} ({amount:.2f})")
            lines.append(f"    validators --> {safe_id}[\"{label}\"]")
    return "\n".join(lines)


def format_reward_summary(summary: RewardSummary) -> str:
    if summary.total_reward == 0:
        return "<div class=\"summary-card\"><p>No rewards were distributed.</p></div>"
    solver_leader = (
        f"Top solver: {escape(summary.top_solver)} ({summary.solver_totals[summary.top_solver]:.2f})"
        if summary.top_solver
        else "Top solver: N/A"
    )
    validator_leader = (
        f"Top validator: {escape(summary.top_validator)} ({summary.validator_totals[summary.top_validator]:.2f})"
        if summary.top_validator
        else "Top validator: N/A"
    )
    return build_rows(
        [
            "<div class=\"summary-card\">",
            f"  <h3>Total Rewards</h3><p>{summary.total_reward:.2f} $AGIα distributed</p>",
            f"  <p>Architect retained {summary.architect_total:.2f}</p>",
            f"  <p>{solver_leader}</p>",
            f"  <p>{validator_leader}</p>",
            "</div>",
        ]
    )


def format_opportunity_cards(report: DemoRunArtifacts) -> str:
    if not report.opportunities:
        return "<div class=\"summary-card\"><p>No actionable opportunities detected.</p></div>"
    cards: list[str] = []
    for opportunity in report.opportunities:
        cards.append(
            "<div class=\"summary-card\">"
            f"  <h3>{escape(opportunity.name)}</h3>"
            f"  <p>Impact score: {opportunity.impact_score * 100:.1f}%</p>"
            f"  <p>Confidence: {opportunity.confidence * 100:.1f}%</p>"
            f"  <p>Capital share: {opportunity.capital_allocation * 100:.1f}%</p>"
            f"  <p>Energy ratio: {opportunity.energy_ratio * 100:.1f}%</p>"
            f"  <p class=\"note\">{escape(opportunity.narrative)}</p>"
            "</div>"
        )
    return build_rows(cards)


def build_opportunity_mermaid(report: DemoRunArtifacts) -> str:
    if not report.opportunities:
        return "graph TD\n  empty[No opportunities surfaced this cycle]"
    lines = [
        "graph TD",
        "    architect[[Sovereign Architect]]",
        "    treasury((Treasury))",
    ]
    for index, opportunity in enumerate(report.opportunities, start=1):
        node_id = f"opp{index}"
        label = mermaid_escape(
            f"{opportunity.name}\\nImpact {opportunity.impact_score * 100:.1f}% | Confidence {opportunity.confidence * 100:.1f}%"
        )
        capital_label = mermaid_escape(
            f"Capital {opportunity.capital_allocation * 100:.1f}% | Energy {opportunity.energy_ratio * 100:.1f}%"
        )
        lines.append(f"    architect --> {node_id}[\"{label}\"]")
        lines.append(f"    {node_id} --> treasury{{\"{capital_label}\"}}")
    return "\n".join(lines)


def format_verification_cards(verification: VerificationDigest) -> str:
    cards = [
        "<div class=\"summary-card\">",
        f"  <h3>Primary Score</h3><p>{verification.primary_score:.4f}</p>",
        f"  <p>Overall verdict: {'PASS' if verification.overall_pass else 'ATTENTION'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Resilience Index</h3><p>{verification.resilience_index:.4f}</p>",
        "  <p>Stress × entropy × confidence composite</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Residual Balance</h3><p>Mean {verification.residual_mean:+.4f}</p>",
        f"  <p>Std {verification.residual_std:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_residual_balance else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Residual Skewness</h3><p>{verification.residual_skewness:+.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_skewness else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Residual Kurtosis</h3><p>{verification.residual_kurtosis:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_kurtosis else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Holdout Divergence</h3><p>{verification.divergence:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_divergence else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>MAE Consistency</h3><p>{verification.mae_score:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_mae else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Confidence Interval</h3><p>{verification.bootstrap_interval[0]:.4f} → {verification.bootstrap_interval[1]:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_confidence else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Jackknife Stability</h3><p>{verification.jackknife_interval[0]:.4f} → {verification.jackknife_interval[1]:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_jackknife else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Monotonicity</h3><p>Violations: {verification.monotonic_violations}</p>",
        f"  <p>Status: {'PASS' if verification.monotonic_pass else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Stress Suite</h3><p>Min {(min(verification.stress_scores.values()) if verification.stress_scores else 0.0):.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_stress else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Entropy Shield</h3><p>{verification.entropy_score:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_entropy else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Decimal Replay</h3><p>{verification.precision_replay_score:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_precision_replay else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Variance Ratio</h3><p>{verification.variance_ratio:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_variance_ratio else 'ALERT'}</p>",
        "</div>",
        "<div class=\"summary-card\">",
        f"  <h3>Spectral Energy</h3><p>{verification.spectral_ratio:.4f}</p>",
        f"  <p>Status: {'PASS' if verification.pass_spectral_ratio else 'ALERT'}</p>",
        "</div>",
    ]
    return build_rows(cards)


def format_verification_table(verification: VerificationDigest) -> str:
    if not verification.holdout_scores:
        return "<p class=\"note\">No holdout evaluations were executed.</p>"
    rows = "".join(
        f"<tr><td>{escape(name)}</td><td>{score:.4f}</td><td>{score - verification.primary_score:+.4f}</td></tr>"
        for name, score in sorted(verification.holdout_scores.items())
    )
    stress_rows = "".join(
        f"<tr><td>{escape(name)}</td><td>{score:.4f}</td><td>{'PASS' if score >= verification.stress_threshold else 'ALERT'}</td></tr>"
        for name, score in sorted(verification.stress_scores.items())
    )
    gates = "".join(
        [
            f"<tr><td>Resilience Index</td><td>{verification.resilience_index:.4f}</td><td>{'PASS' if verification.resilience_index >= verification.stress_threshold else 'INSIGHT'}</td></tr>",
            f"<tr><td>MAE Consistency</td><td>{verification.mae_score:.4f}</td><td>{'PASS' if verification.pass_mae else 'ALERT'}</td></tr>",
            f"<tr><td>Bootstrap Interval</td><td>{verification.bootstrap_interval[0]:.4f} → {verification.bootstrap_interval[1]:.4f}</td><td>{'PASS' if verification.pass_confidence else 'ALERT'}</td></tr>",
            f"<tr><td>Jackknife Interval</td><td>{verification.jackknife_interval[0]:.4f} → {verification.jackknife_interval[1]:.4f}</td><td>{'PASS' if verification.pass_jackknife else 'ALERT'}</td></tr>",
            f"<tr><td>Monotonicity</td><td>{verification.monotonic_violations} violation(s)</td><td>{'PASS' if verification.monotonic_pass else 'ALERT'}</td></tr>",
            f"<tr><td>Entropy Shield</td><td>{verification.entropy_score:.4f} (floor {verification.entropy_floor:.2f})</td><td>{'PASS' if verification.pass_entropy else 'ALERT'}</td></tr>",
            f"<tr><td>Decimal Replay</td><td>{verification.precision_replay_score:.4f} (Δ {verification.precision_replay_score - verification.primary_score:+.4f})</td><td>{'PASS' if verification.pass_precision_replay else 'ALERT'}</td></tr>",
            f"<tr><td>Variance Ratio</td><td>{verification.variance_ratio:.4f}</td><td>{'PASS' if verification.pass_variance_ratio else 'ALERT'}</td></tr>",
            f"<tr><td>Spectral Energy</td><td>{verification.spectral_ratio:.4f}</td><td>{'PASS' if verification.pass_spectral_ratio else 'ALERT'}</td></tr>",
            f"<tr><td>Residual Skewness</td><td>{verification.residual_skewness:+.4f}</td><td>{'PASS' if verification.pass_skewness else 'ALERT'}</td></tr>",
            f"<tr><td>Residual Kurtosis</td><td>{verification.residual_kurtosis:.4f}</td><td>{'PASS' if verification.pass_kurtosis else 'ALERT'}</td></tr>",
        ]
    )
    return (
        "<table><thead><tr><th>Holdout</th><th>Score</th><th>Δ vs primary</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
        "<table><thead><tr><th>Stress Scenario</th><th>Score</th><th>Status</th></tr></thead>"
        f"<tbody>{stress_rows or '<tr><td colspan=3>No stress scenarios executed.</td></tr>'}</tbody></table>"
        "<table><thead><tr><th>Gate</th><th>Metric</th><th>Status</th></tr></thead>"
        f"<tbody>{gates}</tbody></table>"
    )


def build_verification_mermaid(verification: VerificationDigest) -> str:
    lower, upper = verification.bootstrap_interval
    return "\n".join(
        [
            "flowchart LR",
            "    primary[Primary score] --> residual[Residual balance]",
            "    primary --> holdout[Holdout suite]",
            "    primary --> mae[MAE score]",
            "    primary --> stress[Stress battery]",
            "    primary --> entropy[Entropy shield]",
            "    primary --> precision[Decimal replay]",
            "    primary --> variance[Variance ratio]",
            "    primary --> spectral[Spectral scan]",
            "    primary --> jackknife[Jackknife sweep]",
            "    primary --> skewness[Residual skewness]",
            "    primary --> kurtosis[Residual kurtosis]",
            "    mae --> bootstrap[Bootstrap CI]",
            "    holdout --> monotonic[Monotonic audit]",
            f"    mae:::status -- {'PASS' if verification.pass_mae else 'ALERT'} --> bootstrap",
            f"    residual:::status -- {'PASS' if verification.pass_residual_balance else 'ALERT'} --> monotonic",
            f"    holdout:::status -- {'PASS' if verification.pass_holdout else 'ALERT'} --> monotonic",
            f"    stress:::status -- {('≥' if verification.pass_stress else '<')} {verification.stress_threshold:.2f} --> verdict[Final verdict]",
            f"    entropy:::status -- {('≥' if verification.pass_entropy else '<')} {verification.entropy_floor:.2f} --> verdict",
            f"    precision:::status -- {'PASS' if verification.pass_precision_replay else 'ALERT'} --> verdict",
            f"    variance:::status -- {'PASS' if verification.pass_variance_ratio else 'ALERT'} --> verdict",
            f"    spectral:::status -- {'PASS' if verification.pass_spectral_ratio else 'ALERT'} --> verdict",
            f"    jackknife:::status -- {'PASS' if verification.pass_jackknife else 'ALERT'} --> verdict",
            f"    skewness:::status -- {'PASS' if verification.pass_skewness else 'ALERT'} --> verdict",
            f"    kurtosis:::status -- {'PASS' if verification.pass_kurtosis else 'ALERT'} --> verdict",
            f"    bootstrap:::status -- {lower:.3f}→{upper:.3f} --> verdict[Final verdict]",
            f"    monotonic:::status -- {'PASS' if verification.monotonic_pass else 'ALERT'} --> verdict",
            "    classDef status fill:#0f172a,color:#f8fafc,stroke:#38bdf8,stroke-width:2px",
            "    class primary,residual,holdout,mae,stress,entropy,precision,variance,spectral,jackknife,skewness,kurtosis,bootstrap,monotonic,verdict status",
        ]
    )


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
    reward_summary_cards = format_reward_summary(report.reward_summary)
    opportunity_cards = format_opportunity_cards(report)
    opportunity_mermaid = build_opportunity_mermaid(report)
    verification_cards = format_verification_cards(report.verification)
    verification_table = format_verification_table(report.verification)
    verification_mermaid = build_verification_mermaid(report.verification)
    verification_badge = "pass" if report.verification.overall_pass else "alert"
    verification_status = (
        "All verification gates passed"
        if report.verification.overall_pass
        else "Verification attention required"
    )
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
        verification_badge=verification_badge,
        verification_status=verification_status,
        verification_cards=verification_cards,
        verification_table=verification_table,
        verification_mermaid=verification_mermaid,
        owner_rows=owner_rows,
        timelock_rows=timelock_rows,
        evolution_rows=evolution_rows,
        job_rows=job_rows,
        reward_tables=reward_tables,
        performance_cards=performance_cards,
        opportunity_cards=opportunity_cards,
        opportunity_mermaid=opportunity_mermaid,
        architecture_mermaid=architecture_mermaid,
        timeline_mermaid=timeline_mermaid,
        reward_mermaid=reward_mermaid,
        reward_summary_cards=reward_summary_cards,
        mermaid_js=load_mermaid_js(),
    )



def render_batch_html(
    reports: Mapping[str, DemoRunArtifacts],
    summary: Mapping[str, object],
    bundles: Mapping[str, ReportBundle],
    output_dir: Path,
    scenarios: Mapping[str, DemoScenario] | None,
) -> str:
    items = sorted(reports.items(), key=lambda item: item[1].final_score, reverse=True)
    summary_cards = _build_summary_cards(summary)
    table_rows = _build_table_rows(items, bundles, output_dir, scenarios)
    mermaid_graph = _build_mermaid_graph(items, scenarios)
    return BATCH_HTML_TEMPLATE.format(
        title="Meta-Agentic Mission Constellation",
        mermaid_js=load_mermaid_js(),
        scenario_count=int(summary.get("completed", 0)),
        pass_rate=float(summary.get("pass_rate", 0.0)) * 100.0,
        owner_touchpoints=int(summary.get("owner_touchpoints", 0)),
        average_resilience=float(summary.get("average_resilience", 0.0)),
        summary_cards=summary_cards,
        table_rows=table_rows,
        mermaid_graph=mermaid_graph,
    )


def export_batch_report(
    reports: Mapping[str, DemoRunArtifacts],
    output_dir: Path,
    bundles: Mapping[str, ReportBundle],
    *,
    scenarios: Mapping[str, DemoScenario] | None = None,
) -> ReportBundle:
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = _summarise_batch(reports)
    payload: Dict[str, object] = {"summary": summary, "scenarios": {}}
    scenario_payload = payload["scenarios"]
    for identifier, report in reports.items():
        bundle = bundles.get(identifier)
        artefact_paths = {}
        if bundle is not None:
            artefact_paths = {
                "json": _relative_path(bundle.json_path, output_dir),
                "html": _relative_path(bundle.html_path, output_dir),
            }
        entry: Dict[str, object] = {"report": report.to_dict(), "artefacts": artefact_paths}
        if scenarios and identifier in scenarios:
            entry["scenario"] = scenarios[identifier].to_dict()
        scenario_payload[identifier] = entry
    json_path = output_dir / 'batch.json'
    html_path = output_dir / 'batch.html'
    json_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    html_path.write_text(
        render_batch_html(reports, summary, bundles, output_dir, scenarios),
        encoding='utf-8',
    )
    return ReportBundle(json_path=json_path, html_path=html_path)

def export_report(report: DemoRunArtifacts, output_dir: Path) -> ReportBundle:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "report.json"
    html_path = output_dir / "report.html"
    json_path.write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    return ReportBundle(json_path=json_path, html_path=html_path)


__all__ = [
    "export_report",
    "export_batch_report",
    "render_html",
    "render_batch_html",
    "ReportBundle",
    "load_mermaid_js",
]
