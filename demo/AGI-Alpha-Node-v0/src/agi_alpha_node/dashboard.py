"""Dashboard generator."""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Dict, Iterable, List

from jinja2 import Environment, FileSystemLoader

from .compliance import ComplianceSnapshot


class DashboardRenderer:
    def __init__(self, template_path: Path):
        self.env = Environment(loader=FileSystemLoader(template_path.parent))
        self.template = self.env.get_template(template_path.name)

    def render(
        self,
        *,
        output_path: Path,
        compliance: ComplianceSnapshot,
        economic_metrics: Iterable[Dict[str, str]],
        governance_insights: List[str],
        strategic_insights: List[str],
        action_url: str,
        mermaid_diagram: str,
    ) -> Path:
        html = self.template.render(
            header_title="Autonomous Alpha Reinvention",
            lead="Institutional-grade agentic intelligence orchestrating real-time value creation.",
            economic_metrics=list(economic_metrics),
            compliance=compliance.scores,
            governance_insights=governance_insights,
            strategic_insights=strategic_insights,
            action_url=action_url,
            mermaid_diagram=mermaid_diagram,
            timestamp=dt.datetime.now(dt.timezone.utc).isoformat(),
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(html)
        return output_path


__all__ = ["DashboardRenderer"]
