"""UI renderers for the Meta-Agentic α-AGI Jobs Prime demo."""
from __future__ import annotations

from html import escape
from pathlib import Path

from .orchestrator import ExecutionSummary


def generate_html_dashboard(summary: ExecutionSummary) -> str:
    """Generate a standalone HTML dashboard that non-technical owners can open."""
    rows = []
    identify = summary.phase_outputs.identify
    if identify:
        for opportunity in identify.opportunities:
            rows.append(
                f"<tr><td>{escape(opportunity.domain.title())}</td>"
                f"<td>{escape(opportunity.description)}</td>"
                f"<td>{opportunity.expected_alpha:.2f}</td>"
                f"<td>{opportunity.risk_score:.2f}</td></tr>"
            )
    table_html = "\n".join(rows)

    mermaid_block = f"<pre class='mermaid'>{escape(summary.mermaid_diagram)}</pre>"

    strategies_html = []
    strategies = summary.phase_outputs.strategise or []
    for strategy in strategies:
        strategies_html.append(
            "<section class='strategy-card'>"
            f"<h3>{escape(strategy.design.plan.opportunity.domain.title())} Strategy</h3>"
            f"<p><strong>Priority:</strong> {strategy.priority} — <strong>Allocation:</strong> {strategy.allocation:.2f}</p>"
            f"<p><strong>Stop Conditions:</strong> {escape(', '.join(strategy.stop_conditions))}</p>"
            "</section>"
        )

    html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Meta-Agentic α-AGI Jobs Prime Demo Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({{ startOnLoad: true, theme: "forest" }});</script>
  <style>
    body {{
      font-family: 'Space Grotesk', sans-serif;
      background: radial-gradient(circle at top, #0b1a2a, #030712);
      color: #f5f7ff;
      margin: 0;
      padding: 2rem;
    }}
    header {{
      text-align: center;
      margin-bottom: 2rem;
    }}
    h1 {{
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }}
    .summary-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }}
    .card {{
      background: rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      padding: 1.5rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(12px);
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }}
    th, td {{
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }}
    th {{
      text-align: left;
      font-size: 0.85rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(245, 247, 255, 0.72);
    }}
    .strategy-card {{
      background: linear-gradient(135deg, rgba(0, 255, 195, 0.2), rgba(0, 125, 255, 0.25));
      border-radius: 16px;
      padding: 1.5rem;
      margin-top: 1rem;
    }}
    .footer {{
      margin-top: 2rem;
      text-align: center;
      font-size: 0.9rem;
      color: rgba(245, 247, 255, 0.65);
    }}
  </style>
</head>
<body>
  <header>
    <h1>Meta-Agentic α-AGI Jobs Prime Demo</h1>
    <p>Empowering owners to command planet-scale intelligence autonomously.</p>
  </header>
  <main>
    <section class="card">
      <h2>Opportunity Pipeline</h2>
      <table>
        <thead>
          <tr>
            <th>Domain</th>
            <th>Description</th>
            <th>Expected α</th>
            <th>Risk Score</th>
          </tr>
        </thead>
        <tbody>
          {table_html}
        </tbody>
      </table>
    </section>
    <section class="card">
      <h2>Autonomous Strategy Flow</h2>
      {mermaid_block}
    </section>
    {''.join(strategies_html)}
  </main>
  <footer class="footer">
    Generated at {escape(summary.timestamp.isoformat())}. All controls adjustable via the governance console.
  </footer>
</body>
</html>
"""
    return html


def save_dashboard_html(summary: ExecutionSummary, destination: str | Path) -> None:
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(generate_html_dashboard(summary), encoding="utf-8")

