"""Utility benchmark demo orchestrator for AGI Jobs v0 (v2).

The orchestrator is intentionally designed to be approachable for a
non-technical operator while still modelling the governance hooks and
telemetry collection that production deployments demand.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence
from textwrap import fill

try:
    import yaml  # type: ignore
except ImportError as exc:  # pragma: no cover - guarded by deps target
    raise ImportError(
        "PyYAML is required for the AGI Jobs day-one demo. Install dependencies with `make deps`."
    ) from exc

plot_available = True
try:  # pragma: no cover - runtime capability detection
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:  # pragma: no cover
    plot_available = False


@dataclass(frozen=True)
class JobRecord:
    """Represents a deterministic micro job snapshot."""

    job_id: str
    baseline_acceptance: float
    baseline_cost: float
    baseline_latency: float


@dataclass(frozen=True)
class StrategyProfile:
    """Configuration describing how to transform baseline telemetry."""

    name: str
    title: str
    acceptance_multiplier: float
    cost_multiplier: float
    latency_multiplier: float
    reliability_score: float
    description: str
    highlights: Sequence[str]
    treasury_bonus_bps: int = 0
    # When positive this adds a utility boost that simulates better matching quality.
    qualitative_uplift_bps: int = 0


class StrategyNotFoundError(KeyError):
    """Raised when a strategy is requested that is not configured."""


class DemoPausedError(RuntimeError):
    """Raised when the owner has paused the demo pipeline."""


class DayOneUtilityOrchestrator:
    """Central orchestrator for the day-one utility benchmark demo."""

    OWNER_SCHEMA: Mapping[str, Any] = {
        "owner_address": str,
        "treasury_address": str,
        "platform_fee_bps": int,
        "latency_threshold_override_bps": (int, type(None)),
        "paused": bool,
        "narrative": str,
    }

    def __init__(self, base_path: Optional[Path] = None) -> None:
        self.base_path = base_path or Path(__file__).resolve().parent
        self.config_dir = self.base_path / "config"
        self.output_dir = self.base_path / "out"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._owner_config_path = self.config_dir / "owner_controls.yaml"
        if not self._owner_config_path.exists():
            raise FileNotFoundError(
                "Owner controls file is missing. Re-run `make bootstrap` to restore defaults."
            )

    # ------------------------------------------------------------------
    # Configuration helpers
    # ------------------------------------------------------------------
    def _load_yaml(self, path: Path) -> Any:
        with path.open("r", encoding="utf-8") as handle:
            return yaml.safe_load(handle)

    def _save_yaml(self, path: Path, payload: Mapping[str, Any]) -> None:
        with path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(payload, handle, sort_keys=False)

    def load_jobs(self) -> List[JobRecord]:
        dataset = self._load_yaml(self.config_dir / "microset.yaml")
        jobs: Iterable[Mapping[str, Any]]
        if isinstance(dataset, Mapping):
            jobs = dataset.get("jobs", [])  # type: ignore[assignment]
        else:
            jobs = dataset  # type: ignore[assignment]
        records: List[JobRecord] = []
        for entry in jobs:
            records.append(
                JobRecord(
                    job_id=str(entry["id"]),
                    baseline_acceptance=float(entry["baseline_acceptance"]),
                    baseline_cost=float(entry["baseline_cost"]),
                    baseline_latency=float(entry["baseline_latency"]),
                )
            )
        if not records:
            raise ValueError("No jobs configured in microset dataset")
        return records

    def load_rules(self) -> Mapping[str, Any]:
        payload = self._load_yaml(self.config_dir / "rules.yaml")
        if not isinstance(payload, Mapping):
            raise TypeError("rules.yaml must be a mapping")
        return payload

    def load_strategies(self) -> Mapping[str, StrategyProfile]:
        payload = self._load_yaml(self.config_dir / "strategies.yaml")
        strategies_raw: Mapping[str, Any]
        if not isinstance(payload, Mapping):
            raise TypeError("strategies.yaml must contain a mapping of strategy definitions")
        strategies_raw = payload.get("strategies", payload)  # type: ignore[assignment]
        profiles: Dict[str, StrategyProfile] = {}
        for key, value in strategies_raw.items():
            try:
                profile = StrategyProfile(
                    name=key,
                    title=str(value.get("title", key.title())),
                    acceptance_multiplier=float(value["acceptance_multiplier"]),
                    cost_multiplier=float(value["cost_multiplier"]),
                    latency_multiplier=float(value["latency_multiplier"]),
                    reliability_score=float(value.get("reliability_score", 0.95)),
                    description=str(value.get("description", "")),
                    highlights=tuple(value.get("highlights", [])),
                    treasury_bonus_bps=int(value.get("treasury_bonus_bps", 0)),
                    qualitative_uplift_bps=int(value.get("qualitative_uplift_bps", 0)),
                )
            except (KeyError, TypeError, ValueError) as exc:  # pragma: no cover - configuration guard
                raise ValueError(f"Invalid strategy configuration for {key}") from exc
            profiles[key.lower()] = profile
        if not profiles:
            raise ValueError("At least one strategy must be defined in strategies.yaml")
        return profiles

    # ------------------------------------------------------------------
    # Owner controls management
    # ------------------------------------------------------------------
    def load_owner_controls(self) -> Dict[str, Any]:
        payload = self._load_yaml(self._owner_config_path)
        if not isinstance(payload, MutableMapping):  # pragma: no cover - config guard
            raise TypeError("owner_controls.yaml must contain a mapping")
        # Guarantee schema with defaults
        snapshot: Dict[str, Any] = {}
        for key, expected in self.OWNER_SCHEMA.items():
            if key not in payload:
                raise KeyError(f"Owner controls missing required field: {key}")
            snapshot[key] = payload[key]
        return snapshot

    def save_owner_controls(self, snapshot: Mapping[str, Any]) -> None:
        payload = {key: snapshot[key] for key in self.OWNER_SCHEMA.keys()}
        self._save_yaml(self._owner_config_path, payload)

    def _coerce_owner_value(self, key: str, value: str) -> Any:
        if key not in self.OWNER_SCHEMA:
            raise KeyError(f"Unknown owner control: {key}")
        expected = self.OWNER_SCHEMA[key]
        if expected is bool:
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "y"}:
                return True
            if normalized in {"0", "false", "no", "n"}:
                return False
            raise ValueError(f"Value '{value}' is not a valid boolean for {key}")
        if expected is int:
            return int(value)
        if expected is str:
            return value
        if isinstance(expected, tuple):
            # Currently only used for Optional[int]
            if value.strip().lower() in {"none", "null", ""}:
                return None
            return int(value)
        return value

    def update_owner_control(self, key: str, value: str) -> Dict[str, Any]:
        snapshot = self.load_owner_controls()
        coerced = self._coerce_owner_value(key, value)
        snapshot[key] = coerced
        self._validate_owner_controls(snapshot)
        self.save_owner_controls(snapshot)
        return snapshot

    def toggle_pause(self) -> Dict[str, Any]:
        snapshot = self.load_owner_controls()
        snapshot["paused"] = not bool(snapshot["paused"])
        self._validate_owner_controls(snapshot)
        self.save_owner_controls(snapshot)
        return snapshot

    def explain_owner_controls(self, snapshot: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
        """Return natural-language guidance for each owner control."""

        if snapshot is None:
            snapshot = self.load_owner_controls()

        # Copy so callers may safely mutate the returned snapshot.
        owner_snapshot: Dict[str, Any] = {key: snapshot[key] for key in self.OWNER_SCHEMA.keys() if key in snapshot}
        owner_snapshot.setdefault("latency_threshold_active", snapshot.get("latency_threshold_active"))

        platform_fee_bps = int(owner_snapshot.get("platform_fee_bps", 0))
        latency_override = owner_snapshot.get("latency_threshold_override_bps")
        latency_active = owner_snapshot.get("latency_threshold_active")
        paused = bool(owner_snapshot.get("paused", False))
        narrative_text = str(owner_snapshot.get("narrative", "")).strip()

        explanations: List[str] = []
        explanations.append(
            f"Owner wallet {owner_snapshot.get('owner_address', 'unknown')} retains the ultimate command switch for the demo."
        )
        explanations.append(
            f"Treasury wallet {owner_snapshot.get('treasury_address', 'unknown')} accumulates every platform-fee basis point."
        )
        explanations.append(
            (
                "Platform fee is "
                f"{platform_fee_bps} bps — approximately {platform_fee_bps / 100:.2f}% of every candidate GMV match."
            )
        )
        if latency_override is None:
            if latency_active is not None:
                explanations.append(
                    f"Latency guardrail override unset; sentinel rulebook enforces ±{float(latency_active) * 100:.2f}% delta."
                )
            else:
                explanations.append("Latency guardrail override unset; sentinel defaults remain authoritative.")
        else:
            explanations.append(
                f"Latency guardrail override active at {int(latency_override)} bps (±{int(latency_override) / 100:.2f}%)."
            )
        explanations.append(
            "Demo pipeline is PAUSED — resume with `make owner-toggle`."
            if paused
            else "Demo pipeline is LIVE — strategies can be simulated instantly."
        )
        if narrative_text:
            explanations.append(f"Narrative banner broadcasts: {narrative_text}")

        wrapped = [fill(line, width=100) for line in explanations]
        return {"owner_controls": owner_snapshot, "explanation": wrapped}

    def _validate_owner_controls(self, snapshot: Mapping[str, Any]) -> None:
        fee = int(snapshot["platform_fee_bps"])
        if fee < 0 or fee > 2500:
            raise ValueError("platform_fee_bps must be between 0 and 2500 basis points")
        latency_override = snapshot.get("latency_threshold_override_bps")
        if latency_override is not None:
            latency_val = int(latency_override)
            if latency_val < -1000:
                raise ValueError("latency threshold override cannot reduce guardrails below -1000 bps")
        narrative = str(snapshot.get("narrative", ""))
        if len(narrative) > 1200:
            raise ValueError("narrative section is capped at 1200 characters")

    # ------------------------------------------------------------------
    # Simulation
    # ------------------------------------------------------------------
    def simulate(self, strategy_name: str) -> Mapping[str, Any]:
        snapshot = self.load_owner_controls()
        if snapshot.get("paused"):
            raise DemoPausedError("Demo is paused. Ask the owner to resume from the owner console.")

        strategies = self.load_strategies()
        profile = strategies.get(strategy_name.lower())
        if profile is None:
            raise StrategyNotFoundError(strategy_name)

        jobs = self.load_jobs()
        rules = self.load_rules()
        utility_threshold = float(rules.get("utility_uplift_threshold", 0.0))
        latency_threshold = float(rules.get("max_latency_delta", math.inf))
        override_latency_bps = snapshot.get("latency_threshold_override_bps")
        if override_latency_bps is not None:
            latency_threshold = override_latency_bps / 10_000.0

        total_baseline_gmv = 0.0
        total_candidate_gmv = 0.0
        total_baseline_cost = 0.0
        total_candidate_cost = 0.0
        total_baseline_latency = 0.0
        total_candidate_latency = 0.0
        candidate_latencies: List[float] = []

        acceptance_multiplier = profile.acceptance_multiplier
        cost_multiplier = profile.cost_multiplier
        latency_multiplier = profile.latency_multiplier
        qualitative_uplift = profile.qualitative_uplift_bps / 10_000.0

        for job in jobs:
            total_baseline_gmv += job.baseline_acceptance
            total_baseline_cost += job.baseline_cost
            total_baseline_latency += job.baseline_latency

            candidate_acceptance = job.baseline_acceptance * acceptance_multiplier
            candidate_cost = job.baseline_cost * cost_multiplier
            candidate_latency = job.baseline_latency * latency_multiplier

            total_candidate_gmv += candidate_acceptance * (1.0 + qualitative_uplift)
            total_candidate_cost += candidate_cost
            total_candidate_latency += candidate_latency
            candidate_latencies.append(candidate_latency)

        platform_fee = total_candidate_gmv * snapshot["platform_fee_bps"] / 10_000.0
        treasury_bonus = total_candidate_gmv * profile.treasury_bonus_bps / 10_000.0
        total_candidate_cost += platform_fee

        num_jobs = len(jobs)
        avg_baseline_latency = total_baseline_latency / num_jobs
        avg_candidate_latency = total_candidate_latency / num_jobs

        baseline_utility = total_baseline_gmv - total_baseline_cost
        candidate_utility = total_candidate_gmv - total_candidate_cost + treasury_bonus

        if baseline_utility != 0:
            utility_uplift = (candidate_utility - baseline_utility) / abs(baseline_utility)
        else:
            utility_uplift = math.inf if candidate_utility > 0 else 0.0

        if avg_baseline_latency != 0:
            latency_delta = (avg_candidate_latency - avg_baseline_latency) / abs(avg_baseline_latency)
        else:
            latency_delta = math.inf if avg_candidate_latency > 0 else 0.0

        sorted_latencies = sorted(candidate_latencies)
        if sorted_latencies:
            p95_index = min(len(sorted_latencies) - 1, max(0, math.ceil(0.95 * (len(sorted_latencies) - 1))))
            latency_p95 = sorted_latencies[p95_index]
        else:
            latency_p95 = 0.0

        owner_snapshot = {
            **snapshot,
            "platform_fee_bps": int(snapshot["platform_fee_bps"]),
            "latency_threshold_active": latency_threshold,
            "treasury_bonus_bps": profile.treasury_bonus_bps,
            "treasury_bonus_value": treasury_bonus,
        }

        guardrail_status = {
            "utility_uplift": utility_uplift >= utility_threshold,
            "latency_delta": latency_delta <= latency_threshold,
            "reliability_score": profile.reliability_score >= 0.92,
        }

        metrics_block = {
            "baseline": {
                "total_gmv": total_baseline_gmv,
                "total_cost": total_baseline_cost,
                "utility": baseline_utility,
                "avg_latency": avg_baseline_latency,
            },
            "candidate": {
                "total_gmv": total_candidate_gmv,
                "total_cost": total_candidate_cost,
                "utility": candidate_utility,
                "avg_latency": avg_candidate_latency,
                "platform_fee": platform_fee,
                "treasury_bonus": treasury_bonus,
            },
            "utility_uplift": utility_uplift,
            "latency_delta": latency_delta,
            "latency_p95": latency_p95,
            "owner_treasury": platform_fee + treasury_bonus,
        }

        report = {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "strategy": profile.name,
            "strategy_profile": {
                "title": profile.title,
                "description": profile.description,
                "highlights": list(profile.highlights),
                "reliability_score": profile.reliability_score,
            },
            "metrics": metrics_block,
            "rules": {
                "utility_uplift_threshold": utility_threshold,
                "max_latency_delta": latency_threshold,
            },
            "guardrail_pass": guardrail_status,
            "owner_controls": owner_snapshot,
            "mermaid": self._build_mermaid_summaries(profile, guardrail_status),
        }

        chart_path = None
        if plot_available:
            chart_path = self._render_chart(profile, metrics_block)
        html_path = self._render_dashboard(report, chart_path)

        self._write_json(self.output_dir / f"report_{profile.name}.json", report)
        self._write_json(self.output_dir / "owner_controls_snapshot.json", owner_snapshot)

        report["outputs"] = {
            "chart": str(chart_path) if chart_path else None,
            "dashboard": str(html_path),
        }
        explainer = self.explain_owner_controls(owner_snapshot)
        report["cli"] = {
            "summary": self._compose_cli_summary(report),
            "owner_console": explainer["explanation"],
        }
        return report

    def _write_json(self, path: Path, payload: Mapping[str, Any]) -> None:
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)

    # ------------------------------------------------------------------
    # Visualization helpers
    # ------------------------------------------------------------------
    def _compose_cli_summary(self, report: Mapping[str, Any]) -> str:
        profile = report["strategy_profile"]
        metrics = report["metrics"]
        guardrails = report["guardrail_pass"]
        owner = report["owner_controls"]

        utility_status = "PASS" if guardrails.get("utility_uplift", False) else "CHECK"
        latency_status = "PASS" if guardrails.get("latency_delta", False) else "CHECK"
        reliability_status = "PASS" if guardrails.get("reliability_score", False) else "CHECK"

        highlight = ""
        highlights = profile.get("highlights")
        if highlights:
            highlight = fill(f"Highlight: {highlights[0]}", width=100, subsequent_indent="   ")

        lines = [
            f"🚀 {profile['title']} :: Utility uplift {metrics['utility_uplift']*100:+.2f}% ({utility_status})",
            f"   Latency delta {metrics['latency_delta']*100:+.2f}% ({latency_status}) · Reliability {profile['reliability_score']*100:.1f}% ({reliability_status})",
            f"   Owner treasury capture {metrics['owner_treasury']:.2f} (platform fee {owner['platform_fee_bps']} bps).",
        ]
        if highlight:
            lines.append(f"   {highlight}")
        narrative = str(owner.get("narrative", "")).strip()
        if narrative:
            lines.append("   " + fill(f"Narrative: {narrative}", width=100, subsequent_indent="   "))
        return "\n".join(lines)

    def _render_chart(self, profile: StrategyProfile, metrics: Mapping[str, Any]) -> Path:
        baseline = metrics["baseline"]
        candidate = metrics["candidate"]
        categories = ["GMV", "Cost", "Utility"]
        baseline_vals = [baseline["total_gmv"], baseline["total_cost"], baseline["utility"]]
        candidate_vals = [candidate["total_gmv"], candidate["total_cost"], candidate["utility"]]

        x_positions = range(len(categories))
        width = 0.36
        fig, ax = plt.subplots(figsize=(8, 4.8))
        ax.bar([x - width / 2 for x in x_positions], baseline_vals, width, label="Baseline", color="#0F172A")
        ax.bar([x + width / 2 for x in x_positions], candidate_vals, width, label="Candidate", color="#38BDF8")
        ax.set_xticks(list(x_positions))
        ax.set_xticklabels(categories, fontsize=11)
        ax.set_ylabel("Value", fontsize=11)
        ax.set_title(f"Baseline vs Candidate Metrics — {profile.title}", fontsize=13)
        ax.legend(loc="upper left")
        for idx, value in enumerate(baseline_vals):
            ax.text(idx - width / 2, value + max(baseline_vals + candidate_vals) * 0.02, f"{value:.2f}", ha="center")
        for idx, value in enumerate(candidate_vals):
            ax.text(idx + width / 2, value + max(baseline_vals + candidate_vals) * 0.02, f"{value:.2f}", ha="center")
        fig.tight_layout()
        chart_path = self.output_dir / f"snapshot_{profile.name}.png"
        fig.savefig(chart_path)
        plt.close(fig)
        return chart_path

    def _build_mermaid_summaries(
        self, profile: StrategyProfile, guardrail_status: Mapping[str, bool]
    ) -> Mapping[str, str]:
        guardrail_state = {
            key: "Pass" if value else "Investigate" for key, value in guardrail_status.items()
        }
        systems_diagram = f"""
        flowchart LR
            user((Operator Command Deck)) -->|orchestrates| orchestrator{{AGI Jobs Day-One Orchestrator}}
            orchestrator -->|pull microset| dataLake[(Curated Microset)]
            orchestrator -->|apply {profile.title}| strategyEngine[/Strategy Engine/]
            strategyEngine --> telemetry[(Telemetry Ledger)]
            telemetry -->|publish uplift| utility{{Utility Monitor}}
            utility -->|enforce guardrails| guardrails[(Sentinel Rules)]
            guardrails -->|status| dashboard{{Grand Demo Dashboard}}
            orchestrator -->|owner controls| ownerDeck[(Owner Controls)]
        """

        guardrail_diagram = f"""
        graph TD
            A[Utility Uplift ≥ Threshold] --> B[{guardrail_state['utility_uplift']}]
            C[Latency Delta ≤ Guardrail] --> D[{guardrail_state['latency_delta']}]
            E[Reliability Score ≥ 0.92] --> F[{guardrail_state['reliability_score']}]
            B --> G{{Launch Verdict}}
            D --> G
            F --> G
        """

        owner_flow = """
        sequenceDiagram
            participant Owner as Contract Owner
            participant Console as Owner Console
            participant Orchestrator as Orchestrator
            participant Dashboard as Hyperdashboard
            Owner->>Console: Update control values
            Console->>Orchestrator: Write owner_controls.yaml
            Orchestrator->>Dashboard: Publish refreshed telemetry
            Dashboard-->>Owner: Render grandiose uplift narrative
        """

        return {
            "systems": systems_diagram.strip(),
            "guardrails": guardrail_diagram.strip(),
            "owner": owner_flow.strip(),
        }

    def _render_dashboard(self, report: Mapping[str, Any], chart_path: Optional[Path]) -> Path:
        profile = report["strategy_profile"]
        metrics = report["metrics"]
        owner_controls = report["owner_controls"]
        guardrail_pass = report["guardrail_pass"]
        mermaid_blocks = report["mermaid"]
        highlights = "".join(f"<li>{item}</li>" for item in profile["highlights"])
        guardrail_badges = []
        for key, value in guardrail_pass.items():
            label = key.replace("_", " ").title()
            badge_class = "pass" if value else "fail"
            guardrail_badges.append(f'<span class="badge {badge_class}">{label}</span>')
        guardrail_markup = "".join(guardrail_badges)
        chart_markup = (
            f'<img src="{Path(chart_path).name}" alt="Strategy snapshot chart" class="snapshot" />'
            if chart_path
            else "<p class=\"snapshot\">Matplotlib is unavailable in this environment.</p>"
        )
        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8" />
            <title>{profile['title']} — Day-One Utility Command Deck</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
            <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                :root {{
                    color-scheme: dark;
                    --bg: #020617;
                    --card: rgba(15, 23, 42, 0.8);
                    --accent: #38bdf8;
                    --accent-2: #f8fafc;
                    --fail: #f87171;
                    --pass: #34d399;
                }}
                body {{
                    font-family: 'Space Grotesk', sans-serif;
                    margin: 0;
                    background: radial-gradient(circle at top, rgba(56,189,248,0.12), transparent 45%), var(--bg);
                    color: var(--accent-2);
                    min-height: 100vh;
                }}
                header {{
                    padding: 3rem 5vw;
                    text-align: center;
                }}
                header h1 {{
                    font-size: clamp(2.8rem, 5vw, 4rem);
                    margin-bottom: 0.5rem;
                }}
                header p {{
                    max-width: 70ch;
                    margin: 0 auto;
                    line-height: 1.5;
                }}
                main {{
                    display: grid;
                    gap: 1.5rem;
                    padding: 0 5vw 4rem;
                }}
                .card {{
                    background: var(--card);
                    border-radius: 18px;
                    padding: 1.8rem;
                    box-shadow: 0 40px 120px rgba(56,189,248,0.08);
                    backdrop-filter: blur(12px);
                }}
                .grid-2 {{
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 1.2rem;
                }}
                h2 {{
                    margin-top: 0;
                    font-size: 1.6rem;
                }}
                .metrics-grid {{
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 1rem;
                }}
                .metric {{
                    background: rgba(148, 163, 184, 0.12);
                    border-radius: 14px;
                    padding: 1rem;
                    text-align: center;
                }}
                .metric h3 {{
                    margin: 0;
                    font-size: 0.95rem;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }}
                .metric p {{
                    margin: 0.35rem 0 0;
                    font-size: 1.5rem;
                    font-weight: 600;
                }}
                .badge {{
                    display: inline-flex;
                    align-items: center;
                    padding: 0.4rem 0.8rem;
                    border-radius: 999px;
                    font-size: 0.75rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    margin-right: 0.5rem;
                }}
                .badge.pass {{ background: rgba(52, 211, 153, 0.18); color: var(--pass); }}
                .badge.fail {{ background: rgba(248, 113, 113, 0.18); color: var(--fail); }}
                .snapshot {{
                    display: block;
                    max-width: min(720px, 95%);
                    margin: 0 auto;
                    border-radius: 18px;
                    border: 1px solid rgba(148, 163, 184, 0.2);
                    box-shadow: 0 25px 80px rgba(15,23,42,0.4);
                }}
                ul {{
                    margin: 0;
                    padding-left: 1.1rem;
                    line-height: 1.6;
                }}
                .mermaid {{
                    margin-top: 1.5rem;
                    background: rgba(15,23,42,0.6);
                    border-radius: 16px;
                    padding: 1rem;
                }}
                footer {{
                    text-align: center;
                    padding: 2rem 0;
                    color: rgba(226,232,240,0.6);
                }}
                code {{
                    background: rgba(148, 163, 184, 0.22);
                    padding: 0.2rem 0.5rem;
                    border-radius: 8px;
                    font-size: 0.85rem;
                }}
            </style>
        </head>
        <body>
            <header>
                <h1>{profile['title']}</h1>
                <p>{profile['description']}</p>
                <div>{guardrail_markup}</div>
            </header>
            <main>
                <section class="card">
                    <h2>Launch Metrics</h2>
                    <div class="metrics-grid">
                        <div class="metric"><h3>Utility Uplift</h3><p>{metrics['utility_uplift']*100:.2f}%</p></div>
                        <div class="metric"><h3>Latency Delta</h3><p>{metrics['latency_delta']*100:.2f}%</p></div>
                        <div class="metric"><h3>Reliability Score</h3><p>{profile['reliability_score']*100:.1f}</p></div>
                        <div class="metric"><h3>Owner Treasury</h3><p>{metrics['owner_treasury']:.2f}</p></div>
                    </div>
                </section>
                <section class="card">
                    <h2>Strategy Highlights</h2>
                    <div class="grid-2">
                        <div>
                            <h3>What unlocks day-one value</h3>
                            <ul>{highlights}</ul>
                        </div>
                        <div>
                            <h3>Owner Controls Snapshot</h3>
                            <p><strong>Owner:</strong> {owner_controls['owner_address']}</p>
                            <p><strong>Treasury:</strong> {owner_controls['treasury_address']}</p>
                            <p><strong>Platform Fee:</strong> {owner_controls['platform_fee_bps']} bps</p>
                            <p><strong>Latency Guardrail:</strong> {owner_controls['latency_threshold_active']:.4f}</p>
                            <p><strong>Narrative:</strong> {owner_controls['narrative']}</p>
                        </div>
                    </div>
                </section>
                <section class="card">
                    <h2>Snapshot</h2>
                    {chart_markup}
                </section>
                <section class="card">
                    <h2>Systems Blueprint</h2>
                    <div class="mermaid">{mermaid_blocks['systems']}</div>
                    <div class="mermaid">{mermaid_blocks['guardrails']}</div>
                    <div class="mermaid">{mermaid_blocks['owner']}</div>
                </section>
            </main>
            <footer>
                Generated at {report['generated_at']} · Powered by AGI Jobs v0 (v2)
            </footer>
            <script type="module">
                import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
                mermaid.initialize({{ startOnLoad: true, theme: 'dark' }});
            </script>
        </body>
        </html>
        """
        html_path = self.output_dir / f"dashboard_{report['strategy']}.html"
        with html_path.open("w", encoding="utf-8") as handle:
            handle.write(html)
        return html_path

    # ------------------------------------------------------------------
    # CLI entrypoint
    # ------------------------------------------------------------------
    @classmethod
    def build_parser(cls) -> argparse.ArgumentParser:
        parser = argparse.ArgumentParser(description="AGI Jobs Day-One Utility Benchmark")
        subparsers = parser.add_subparsers(dest="command", required=False)

        simulate = subparsers.add_parser("simulate", help="Run a day-one utility simulation")
        simulate.add_argument("--strategy", default="e2e", help="Strategy key from strategies.yaml")
        simulate.add_argument(
            "--format",
            choices=("json", "narrative"),
            default="json",
            help="Choose whether to render JSON only or also print a narrative summary.",
        )

        owner = subparsers.add_parser("owner", help="View or update owner controls")
        owner.add_argument("--show", action="store_true", help="Display the current owner configuration")
        owner.add_argument("--set", nargs=2, metavar=("KEY", "VALUE"), help="Update a specific owner control")
        owner.add_argument(
            "--toggle-pause", action="store_true", help="Toggle the paused state for the orchestrator"
        )
        owner.add_argument(
            "--explain", action="store_true", help="Print a natural-language explanation of each owner control"
        )

        subparsers.add_parser("list", help="List available strategies")
        return parser

    def execute(self, args: Optional[Sequence[str]] = None) -> Mapping[str, Any]:
        parser = self.build_parser()
        parsed = parser.parse_args(args=args)
        command = parsed.command or "simulate"
        if command == "simulate":
            report = self.simulate(parsed.strategy)
            payload: Dict[str, Any] = {"report": report}
            if getattr(parsed, "format", "json") == "narrative":
                payload["narrative"] = report.get("cli", {}).get("summary")
            return payload
        if command == "owner":
            if parsed.toggle_pause:
                snapshot = self.toggle_pause()
                payload = {"owner_controls": snapshot}
                if parsed.explain:
                    payload["explanation"] = self.explain_owner_controls(snapshot)["explanation"]
                return payload
            if parsed.set:
                key, value = parsed.set
                snapshot = self.update_owner_control(key, value)
                payload = {"owner_controls": snapshot}
                if parsed.explain:
                    payload["explanation"] = self.explain_owner_controls(snapshot)["explanation"]
                return payload
            snapshot = self.load_owner_controls()
            payload = {"owner_controls": snapshot}
            if parsed.explain:
                payload["explanation"] = self.explain_owner_controls(snapshot)["explanation"]
            return payload
        if command == "list":
            strategies = {key: profile.title for key, profile in self.load_strategies().items()}
            return {"strategies": strategies}
        raise ValueError(f"Unknown command {command}")


def run_cli(args: Optional[Sequence[str]] = None) -> Mapping[str, Any]:
    orchestrator = DayOneUtilityOrchestrator()
    return orchestrator.execute(args)


def main() -> None:
    payload = run_cli()
    narrative = payload.get("narrative")
    if narrative:
        print(narrative)
    explanation = payload.get("explanation")
    if isinstance(explanation, list):
        for line in explanation:
            print(f"• {line}")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    main()
