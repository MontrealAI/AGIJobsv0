"""Visualization helpers for the TRM demo."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import plotly.graph_objects as go

from .simulation import DemoMetrics


def build_dashboard(metrics: Iterable[DemoMetrics], output_path: Path) -> None:
    """Render an interactive ROI dashboard comparing all strategies."""

    strategies = [metric.strategy for metric in metrics]
    roi = [metric.roi if metric.roi != float("inf") else 100.0 for metric in metrics]
    value = [metric.total_value for metric in metrics]
    cost = [metric.total_cost for metric in metrics]
    success_rate = [metric.success_rate * 100 for metric in metrics]

    fig = go.Figure()
    fig.add_bar(name="ROI", x=strategies, y=roi, marker_color="#8E44AD")
    fig.add_bar(name="GMV ($)", x=strategies, y=value, marker_color="#1ABC9C")
    fig.add_bar(name="Cost ($)", x=strategies, y=cost, marker_color="#E74C3C")
    fig.update_layout(
        barmode="group",
        title="AGI Jobs v0 • Economic Dominance of the Tiny Recursive Model",
        template="plotly_dark",
        xaxis_title="Strategy",
        yaxis_title="Value / Cost",
        legend_title="Key Metrics",
    )

    table = go.Figure(
        data=[
            go.Table(
                header=dict(values=["Strategy", "ROI", "GMV ($)", "Cost ($)", "Success Rate", "Avg Latency (ms)"]),
                cells=dict(
                    values=[
                        strategies,
                        [f"∞" if m.roi == float("inf") else f"{m.roi:,.2f}" for m in metrics],
                        [f"{m.total_value:,.2f}" for m in metrics],
                        [f"{m.total_cost:,.4f}" for m in metrics],
                        [f"{m.success_rate*100:.1f}%" for m in metrics],
                        [f"{m.average_latency_ms:.2f}" for m in metrics],
                    ],
                ),
            )
        ]
    )

    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    html = f"""
    <html>
      <head>
        <meta charset=\"utf-8\" />
        <title>Tiny Recursive Model Demo Dashboard</title>
      </head>
      <body style="background-color:#0B0C10;color:#ECF0F1;font-family:'Inter',sans-serif;">
        <h1 style="text-align:center;">AGI Jobs v0 • Tiny Recursive Model Impact Dashboard</h1>
        <p style="max-width:960px;margin:0 auto 24px auto;font-size:18px;">
          This interactive dashboard reveals how AGI Jobs v0 empowers operators to
          deploy the Tiny Recursive Model with unrivalled ROI. Explore the grouped
          bars below to appreciate the gulf between traditional heuristics, heavy
          LLM stacks, and the compact-yet-superintelligent TRM.
        </p>
        {fig.to_html(full_html=False, include_plotlyjs='cdn')}
        <h2 style="text-align:center;margin-top:48px;">Strategy Snapshot</h2>
        {table.to_html(full_html=False, include_plotlyjs=False)}
      </body>
    </html>
    """
    output_path.write_text(html)

