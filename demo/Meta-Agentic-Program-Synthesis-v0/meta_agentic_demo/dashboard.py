"""High-impact dashboard rendering for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable, Mapping, MutableMapping

from .config import DemoScenario
from .entities import DemoRunArtifacts
from .report import ReportBundle, load_mermaid_js


@dataclass(frozen=True)
class DashboardBundle:
    """Artefacts created when exporting the sovereign dashboard."""

    html_path: Path
    json_path: Path


def export_dashboard(
    constellation: Mapping[str, DemoRunArtifacts],
    *,
    output_dir: Path,
    bundles: Mapping[str, ReportBundle],
    scenarios: Mapping[str, DemoScenario] | None = None,
    batch_bundle: ReportBundle | None = None,
) -> DashboardBundle:
    """Render the panoramic dashboard and persist JSON + HTML artefacts.

    Parameters
    ----------
    constellation:
        Mapping of scenario identifiers to the run artefacts generated during
        the demo execution.
    output_dir:
        Root directory where the dashboard files should be written.
    bundles:
        Mapping of scenario identifiers to the per-scenario report bundles.
    scenarios:
        Optional catalogue of :class:`DemoScenario` definitions for display
        metadata. If not provided the scenario title from the artefacts will be
        used.
    batch_bundle:
        Optional bundle describing the aggregated constellation report
        generated when multiple missions run in one invocation.

    Returns
    -------
    DashboardBundle
        Pointers to the HTML and JSON payloads generated for the dashboard.
    """

    if not constellation:
        raise ValueError("constellation must contain at least one mission")
    output_dir.mkdir(parents=True, exist_ok=True)
    snapshot = _summarise_constellation(
        constellation=constellation,
        bundles=bundles,
        scenarios=scenarios or {},
        output_dir=output_dir,
        batch_bundle=batch_bundle,
    )
    html = render_dashboard_html(snapshot)
    html_path = output_dir / "index.html"
    html_path.write_text(html, encoding="utf-8")
    json_path = output_dir / "index.json"
    json_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    return DashboardBundle(html_path=html_path, json_path=json_path)


def render_dashboard_html(payload: Mapping[str, object]) -> str:
    """Render the dashboard HTML from a pre-built payload."""

    mermaid_js = load_mermaid_js()
    missions = payload["missions"]
    summary = payload["summary"]
    cards = "".join(_render_mission_card(entry) for entry in missions)
    ledger_rows = "".join(_render_ledger_row(entry) for entry in missions)
    opportunity_rows = "".join(
        _render_opportunity_row(entry)
        for entry in missions
        if entry["opportunities"]
    ) or "<tr><td colspan=4>No opportunities surfaced in this constellation.</td></tr>"
    batch_link = ""
    if payload.get("constellation_report"):
        batch = payload["constellation_report"]
        batch_link = (
            f"<p class=\"note\">Constellation artefacts: "
            f"<a href='{batch['html']}'>HTML</a> · <a href='{batch['json']}'>JSON</a></p>"
        )
    return f"""<!DOCTYPE html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <title>Meta-Agentic Command Theatre</title>
    <style>
      body {{ background:#03040e; color:#f2f7ff; font-family:'Inter', Arial, sans-serif; margin:0; padding:2rem; }}
      h1, h2 {{ color:#7df9ff; margin-bottom:0.5rem; }}
      h1 span {{ display:block; font-size:1rem; color:#94a9ff; text-transform:uppercase; letter-spacing:0.24em; }}
      section {{ margin-bottom:2rem; padding:1.5rem; border-radius:18px; background:rgba(255,255,255,0.04); box-shadow:0 18px 54px rgba(0,0,0,0.42); }}
      .hero {{ display:flex; flex-wrap:wrap; align-items:baseline; gap:1rem; }}
      .hero .metric {{ padding:0.75rem 1.25rem; border-radius:999px; background:linear-gradient(135deg,rgba(0,209,255,0.16),rgba(168,85,247,0.18)); font-weight:600; }}
      .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:1.2rem; }}
      .card {{ padding:1.2rem; border-radius:16px; background:linear-gradient(135deg,rgba(125,249,255,0.12),rgba(168,85,247,0.12)); box-shadow:0 14px 32px rgba(0,0,0,0.32); }}
      .card h3 {{ margin-top:0; color:#ffffff; font-size:1.2rem; }}
      .card p {{ margin:0.35rem 0; color:#cfe3ff; }}
      .badge {{ display:inline-block; margin-right:0.4rem; padding:0.35rem 0.75rem; border-radius:999px; font-size:0.85rem; font-weight:600; }}
      .badge.pass {{ background:linear-gradient(120deg,#24ff8f,#1dd3b0); color:#021a0f; }}
      .badge.alert {{ background:linear-gradient(120deg,#ff7b00,#ff3a3a); color:#1a0404; }}
      table {{ width:100%; border-collapse:collapse; margin-top:1rem; }}
      th, td {{ padding:0.75rem; border-bottom:1px solid rgba(255,255,255,0.12); text-align:left; }}
      th {{ text-transform:uppercase; font-size:0.75rem; letter-spacing:0.12em; color:#9bf6ff; }}
      a {{ color:#9bf6ff; text-decoration:none; }}
      a:hover {{ text-decoration:underline; }}
      .note {{ color:#97abff; font-size:0.9rem; margin-top:1rem; }}
      .mermaid {{ margin-top:1rem; border-radius:16px; background:rgba(0,0,0,0.32); padding:1.25rem; }}
    </style>
    <script>{mermaid_js}</script>
    <script>mermaid.initialize({{ startOnLoad: true, theme: "dark", securityLevel: "strict" }});</script>
  </head>
  <body>
    <section>
      <h1><span>Meta-Agentic Command Theatre</span>{summary['headline']}</h1>
      <div class=\"hero\">
        <div class=\"metric\">Missions: {summary['mission_count']}</div>
        <div class=\"metric\">Pass rate: {summary['pass_rate']:.1%}</div>
        <div class=\"metric\">Average score: {summary['average_score']:.4f}</div>
        <div class=\"metric\">Average resilience: {summary['average_resilience']:.4f}</div>
        <div class=\"metric\">Architect retention: {summary['architect_retention']:.1f}%</div>
      </div>
      <p class=\"note\">Generated at {summary['generated_at']}</p>
      {batch_link}
    </section>
    <section>
      <h2>Mission Fleet</h2>
      <div class=\"grid\">{cards}</div>
      <div class=\"mermaid\">{summary['mermaid']}</div>
    </section>
    <section>
      <h2>Capital & Verification Ledger</h2>
      <table>
        <thead>
          <tr><th>Scenario</th><th>Score</th><th>Resilience</th><th>Verification</th><th>Capital</th><th>Opportunities</th><th>Links</th></tr>
        </thead>
        <tbody>{ledger_rows}</tbody>
      </table>
    </section>
    <section>
      <h2>Opportunity Intelligence</h2>
      <table>
        <thead>
          <tr><th>Scenario</th><th>Opportunity</th><th>Impact</th><th>Narrative</th></tr>
        </thead>
        <tbody>{opportunity_rows}</tbody>
      </table>
    </section>
  </body>
</html>
"""


def _summarise_constellation(
    *,
    constellation: Mapping[str, DemoRunArtifacts],
    bundles: Mapping[str, ReportBundle],
    scenarios: Mapping[str, DemoScenario],
    output_dir: Path,
    batch_bundle: ReportBundle | None,
) -> MutableMapping[str, object]:
    mission_entries: list[MutableMapping[str, object]] = []
    mission_count = len(constellation)
    passes = 0
    resilience_sum = 0.0
    score_sum = 0.0
    architect_total = 0.0
    best_identifier = None
    best_score = -math.inf
    best_resilience_id = None
    best_resilience = -math.inf

    for identifier, artefacts in constellation.items():
        scenario = scenarios.get(identifier)
        title = scenario.title if scenario else artefacts.scenario
        verification = artefacts.verification
        reward = artefacts.reward_summary
        passes += int(verification.overall_pass)
        resilience_sum += verification.resilience_index
        score_sum += artefacts.final_score
        architect_total += reward.architect_total
        if artefacts.final_score > best_score:
            best_score = artefacts.final_score
            best_identifier = identifier
        if verification.resilience_index > best_resilience:
            best_resilience = verification.resilience_index
            best_resilience_id = identifier
        report_bundle = bundles.get(identifier)
        report_links = {
            "html": _relative_path(report_bundle.html_path, output_dir)
            if report_bundle
            else None,
            "json": _relative_path(report_bundle.json_path, output_dir)
            if report_bundle
            else None,
        }
        mission_entries.append(
            {
                "identifier": identifier,
                "title": title,
                "score": artefacts.final_score,
                "resilience": verification.resilience_index,
                "overall_pass": verification.overall_pass,
                "holdout": verification.pass_holdout,
                "stress": verification.pass_stress,
                "entropy": verification.entropy_score,
                "entropy_pass": verification.pass_entropy,
                "rewards": reward.total_reward,
                "architect": reward.architect_total,
                "top_solver": reward.top_solver,
                "top_validator": reward.top_validator,
                "opportunities": [op.to_dict() for op in artefacts.opportunities],
                "opportunity_count": len(artefacts.opportunities),
                "owner_actions": len(artefacts.owner_actions),
                "timelock_actions": len(artefacts.timelock_actions),
                "links": report_links,
            }
        )

    average_score = score_sum / mission_count
    average_resilience = resilience_sum / mission_count
    pass_rate = passes / mission_count
    total_rewards = sum(entry["rewards"] for entry in mission_entries)
    architect_retention = (architect_total / total_rewards * 100) if total_rewards else 0.0
    mermaid = _render_mermaid_graph(mission_entries)

    summary: MutableMapping[str, object] = {
        "headline": "Sovereign fleet operational",
        "mission_count": mission_count,
        "pass_rate": pass_rate,
        "average_score": average_score,
        "average_resilience": average_resilience,
        "best_score_identifier": best_identifier,
        "best_resilience_identifier": best_resilience_id,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "architect_retention": architect_retention,
        "mermaid": mermaid,
    }

    payload: MutableMapping[str, object] = {
        "missions": mission_entries,
        "summary": summary,
    }
    if batch_bundle is not None:
        payload["constellation_report"] = {
            "html": _relative_path(batch_bundle.html_path, output_dir),
            "json": _relative_path(batch_bundle.json_path, output_dir),
        }
    return payload


def _render_mission_card(entry: Mapping[str, object]) -> str:
    badge_class = "pass" if entry["overall_pass"] else "alert"
    verification = "PASS" if entry["overall_pass"] else "ATTENTION"
    solver = entry.get("top_solver") or "—"
    validator = entry.get("top_validator") or "—"
    link_html = ""
    links = entry["links"]
    if links["html"]:
        link_html = (
            f"<p><a href='{links['html']}'>Open sovereign report</a></p>"
        )
    return (
        "<div class='card'>"
        f"<h3>{_escape(entry['title'])}</h3>"
        f"<span class='badge {badge_class}'>{verification}</span>"
        f"<p>Composite score: {entry['score']:.4f}</p>"
        f"<p>Resilience index: {entry['resilience']:.4f}</p>"
        f"<p>Entropy shield: {entry['entropy']:.4f} (pass={entry['entropy_pass']})</p>"
        f"<p>Total rewards: {entry['rewards']:.2f} $AGIα</p>"
        f"<p>Owner touchpoints: {entry['owner_actions']}</p>"
        f"<p>Timelock actions: {entry['timelock_actions']}</p>"
        f"<p>Top solver: {_escape(str(solver))}</p>"
        f"<p>Top validator: {_escape(str(validator))}</p>"
        f"<p>Opportunities: {entry['opportunity_count']}</p>"
        f"{link_html}"
        "</div>"
    )


def _render_ledger_row(entry: Mapping[str, object]) -> str:
    badge_class = "pass" if entry["overall_pass"] else "alert"
    verification = "PASS" if entry["overall_pass"] else "ATTENTION"
    links = entry["links"]
    link_parts = []
    if links["html"]:
        link_parts.append(f"<a href='{links['html']}'>HTML</a>")
    if links["json"]:
        link_parts.append(f"<a href='{links['json']}'>JSON</a>")
    link_html = " · ".join(link_parts) if link_parts else "—"
    return (
        "<tr>"
        f"<td>{_escape(entry['title'])}</td>"
        f"<td>{entry['score']:.4f}</td>"
        f"<td>{entry['resilience']:.4f}</td>"
        f"<td><span class='badge {badge_class}'>{verification}</span></td>"
        f"<td>{entry['rewards']:.2f} $AGIα</td>"
        f"<td>{entry['opportunity_count']}</td>"
        f"<td>{link_html}</td>"
        "</tr>"
    )


def _render_opportunity_row(entry: Mapping[str, object]) -> str:
    title = _escape(entry["title"])
    rows = []
    for item in entry["opportunities"]:
        rows.append(
            "<tr>"
            f"<td>{title}</td>"
            f"<td>{_escape(item['name'])}</td>"
            f"<td>{item['impact_score']:.2f} (confidence={item['confidence']:.2f})</td>"
            f"<td>{_escape(item['narrative'])}</td>"
            "</tr>"
        )
    return "".join(rows)


def _render_mermaid_graph(entries: Iterable[Mapping[str, object]]) -> str:
    lines = ["flowchart LR", "    User((Visionary)) --> Architect[\"Sovereign Architect\"]"]
    for entry in entries:
        identifier = _mermaid_safe(entry["identifier"])
        title = _mermaid_safe(entry["title"])
        lines.append(
            f"    Architect --> {identifier}[\"{title}\\nScore {entry['score']:.3f}\"]"
        )
        lines.append(
            f"    {identifier} --> {identifier}Reward{{\"{entry['rewards']:.1f} $AGIα\"}}"
        )
        if entry["opportunity_count"]:
            lines.append(
                f"    {identifier} --> {identifier}Alpha[[\"Opportunities {entry['opportunity_count']}\"]]"
            )
    lines.append("    Architect --> Treasury((Treasury Oversight))")
    return "\n".join(lines)


def _relative_path(path: Path, output_dir: Path) -> str:
    return os.path.relpath(path, output_dir)


def _escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _mermaid_safe(value: str) -> str:
    return _escape(value).replace("-", "_")


__all__ = [
    "DashboardBundle",
    "export_dashboard",
    "render_dashboard_html",
]

