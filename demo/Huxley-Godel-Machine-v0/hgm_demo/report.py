"""Reporting utilities for the demo."""

from __future__ import annotations

from typing import Dict

from .baseline import BaselineMetrics


def format_table(hgm: Dict[str, float], baseline: BaselineMetrics) -> str:
    lines = [
        "\n=== Demo Outcome Summary ===",
        f"HGM expansions      : {int(hgm.get('expansions', 0))}",
        f"HGM evaluations     : {int(hgm.get('evaluations', 0))}",
        f"HGM GMV             : ${hgm.get('gmv', 0.0):,.2f}",
        f"HGM Cost            : ${hgm.get('cost', 0.0):,.2f}",
        f"HGM ROI             : {hgm.get('roi', 0.0):.2f}",
        "",
        f"Baseline evaluations: {baseline.evaluations}",
        f"Baseline GMV        : ${baseline.gmv:,.2f}",
        f"Baseline Cost       : ${baseline.cost:,.2f}",
        f"Baseline ROI        : {baseline.roi:.2f}",
        "",
        f"ROI Lift            : {hgm.get('roi', 0.0) - baseline.roi:.2f}",
        f"GMV Lift            : ${hgm.get('gmv', 0.0) - baseline.gmv:,.2f}",
    ]
    return "\n".join(lines)

