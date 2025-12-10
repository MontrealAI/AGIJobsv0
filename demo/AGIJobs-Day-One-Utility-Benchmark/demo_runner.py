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
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Tuple

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
        "utility_threshold_override_bps": (int, type(None)),
        "paused": bool,
        "narrative": str,
    }

    def __init__(self, base_path: Optional[Path] = None) -> None:
        self.base_path = base_path or Path(__file__).resolve().parent
        self.config_dir = self.base_path / "config"
        self.output_dir = self.base_path / "out"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._owner_config_path = self.config_dir / "owner_controls.yaml"
        self._owner_defaults_path = self.config_dir / "owner_controls.defaults.yaml"
        if not self._owner_defaults_path.exists():
            raise FileNotFoundError(
                "Owner control defaults missing. Ensure owner_controls.defaults.yaml is present."
            )
        if not self._owner_config_path.exists():
            self._restore_owner_controls_from_defaults()
        self._validate_owner_controls(self.load_owner_controls())

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
        self._add_strategy_aliases(profiles)
        if not profiles:
            raise ValueError("At least one strategy must be defined in strategies.yaml")
        return profiles

    @staticmethod
    def _add_strategy_aliases(profiles: Dict[str, StrategyProfile]) -> None:
        """Inject forgiving aliases for the flagship configurations."""

        aliases = {"core": "e2e", "default": "e2e"}
        for alias, target in aliases.items():
            target_key = target.lower()
            if target_key in profiles and alias not in profiles:
                profiles[alias] = profiles[target_key]

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

    def _load_owner_defaults(self) -> Mapping[str, Any]:
        defaults = self._load_yaml(self._owner_defaults_path)
        if not isinstance(defaults, Mapping):
            raise TypeError("owner_controls.defaults.yaml must contain a mapping")
        return defaults

    def _restore_owner_controls_from_defaults(self) -> Dict[str, Any]:
        defaults = self._load_owner_defaults()
        snapshot = {key: defaults[key] for key in self.OWNER_SCHEMA.keys()}
        self._validate_owner_controls(snapshot)
        self.save_owner_controls(snapshot)
        return snapshot

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

    def reset_owner_controls(self) -> Dict[str, Any]:
        return self._restore_owner_controls_from_defaults()

    def _validate_owner_controls(self, snapshot: Mapping[str, Any]) -> None:
        fee = int(snapshot["platform_fee_bps"])
        if fee < 0 or fee > 2500:
            raise ValueError("platform_fee_bps must be between 0 and 2500 basis points")
        latency_override = snapshot.get("latency_threshold_override_bps")
        if latency_override is not None:
            latency_val = int(latency_override)
            if latency_val < -1000:
                raise ValueError("latency threshold override cannot reduce guardrails below -1000 bps")
        utility_override = snapshot.get("utility_threshold_override_bps")
        if utility_override is not None:
            utility_val = int(utility_override)
            if utility_val < -1000 or utility_val > 100_000:
                raise ValueError(
                    "utility threshold override must be between -1000 and 100000 basis points"
                )
        narrative = str(snapshot.get("narrative", ""))
        if len(narrative) > 1200:
            raise ValueError("narrative section is capped at 1200 characters")
        for label in ("owner_address", "treasury_address"):
            address = str(snapshot.get(label, ""))
            if not re.fullmatch(r"0x[a-fA-F0-9]{40}", address):
                raise ValueError(f"{label} must be an EVM address (0x-prefixed, 40 hex chars)")

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
            available = ", ".join(sorted(strategies))
            raise StrategyNotFoundError(f"Unknown strategy '{strategy_name}'. Available: {available}")

        jobs = self.load_jobs()
        rules = self.load_rules()
        utility_threshold = float(rules.get("utility_uplift_threshold", 0.0))
        latency_threshold = float(rules.get("max_latency_delta", math.inf))
        override_latency_bps = snapshot.get("latency_threshold_override_bps")
        if override_latency_bps is not None:
            latency_threshold = override_latency_bps / 10_000.0
        override_utility_bps = snapshot.get("utility_threshold_override_bps")
        if override_utility_bps is not None:
            utility_threshold = override_utility_bps / 10_000.0

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
            "utility_threshold_active": utility_threshold,
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
        return report

    def _write_json(self, path: Path, payload: Mapping[str, Any]) -> None:
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)

    # ------------------------------------------------------------------
    # Scoreboard orchestration
    # ------------------------------------------------------------------
    def scoreboard(self, strategies: Optional[Sequence[str]] = None) -> Mapping[str, Any]:
        available = self.load_strategies()
        if strategies is None:
            requested = list(available.keys())
        else:
            requested = []
            for item in strategies:
                key = item.lower()
                if key not in available:
                    raise StrategyNotFoundError(item)
                if key not in requested:
                    requested.append(key)

        if not requested:
            raise ValueError("At least one strategy must be supplied to generate a scoreboard")

        summaries: Dict[str, Mapping[str, Any]] = {}
        guardrail_failures: List[Mapping[str, Any]] = []
        owner_snapshot: Optional[Mapping[str, Any]] = None

        for key in requested:
            report = self.simulate(key)
            metrics = report["metrics"]
            profile = report["strategy_profile"]
            guardrails = report["guardrail_pass"]
            failed = [name for name, passed in guardrails.items() if not passed]
            if failed:
                guardrail_failures.append({
                    "strategy": key,
                    "title": profile["title"],
                    "failed": failed,
                })
            summaries[key] = {
                "title": profile["title"],
                "utility_uplift": float(metrics["utility_uplift"]),
                "latency_delta": float(metrics["latency_delta"]),
                "latency_p95": float(metrics.get("latency_p95", 0.0)),
                "owner_treasury": float(metrics["owner_treasury"]),
                "reliability_score": float(profile["reliability_score"]),
                "report_path": str(self.output_dir / f"report_{key}.json"),
                "dashboard_path": report["outputs"]["dashboard"],
                "snapshot_path": report["outputs"].get("chart"),
                "guardrail_pass": guardrails,
            }
            owner_snapshot = report["owner_controls"]

        utility_leader = max(summaries.items(), key=lambda item: item[1]["utility_uplift"])
        treasury_leader = max(summaries.items(), key=lambda item: item[1]["owner_treasury"])
        reliability_leader = max(summaries.items(), key=lambda item: item[1]["reliability_score"])
        latency_leader = min(summaries.items(), key=lambda item: item[1]["latency_delta"])
        latency_p95_leader = min(summaries.items(), key=lambda item: item[1]["latency_p95"])

        aggregates = {
            "total_owner_treasury": sum(item["owner_treasury"] for item in summaries.values()),
            "average_utility_uplift": sum(item["utility_uplift"] for item in summaries.values()) / len(summaries),
            "average_latency_delta": sum(item["latency_delta"] for item in summaries.values()) / len(summaries),
            "average_latency_p95": sum(item["latency_p95"] for item in summaries.values()) / len(summaries),
        }

        def _leader_payload(entry: Tuple[str, Mapping[str, Any]]) -> Mapping[str, Any]:
            key, payload = entry
            return {
                "strategy": key,
                "title": payload["title"],
                "value": payload,
            }

        leaders = {
            "utility_uplift": _leader_payload(utility_leader),
            "owner_treasury": _leader_payload(treasury_leader),
            "reliability": _leader_payload(reliability_leader),
            "latency_delta": _leader_payload(latency_leader),
            "latency_p95": _leader_payload(latency_p95_leader),
        }

        if owner_snapshot is None:
            owner_snapshot = self.load_owner_controls()

        mermaid_blocks = self._build_scoreboard_mermaid(summaries, leaders)

        scoreboard_payload: Dict[str, Any] = {
            "type": "scoreboard",
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "strategies": summaries,
            "leaders": leaders,
            "aggregates": aggregates,
            "guardrail_failures": guardrail_failures,
            "owner_controls": owner_snapshot,
            "mermaid": mermaid_blocks,
        }

        scoreboard_payload["metrics"] = {
            "utility_uplift": leaders["utility_uplift"]["value"]["utility_uplift"],
            "latency_delta": leaders["latency_delta"]["value"]["latency_delta"],
            "owner_treasury": aggregates["total_owner_treasury"],
            "average_utility_uplift": aggregates["average_utility_uplift"],
            "average_latency_delta": aggregates["average_latency_delta"],
            "average_latency_p95": aggregates["average_latency_p95"],
            "best_latency_p95": leaders["latency_p95"]["value"]["latency_p95"],
        }

        html_path = self._render_scoreboard_html(scoreboard_payload)
        scoreboard_payload["outputs"] = {"dashboard": str(html_path)}

        self._write_json(self.output_dir / "scoreboard.json", scoreboard_payload)
        return scoreboard_payload

    # ------------------------------------------------------------------
    # Visualization helpers
    # ------------------------------------------------------------------
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

    def _build_scoreboard_mermaid(
        self, summaries: Mapping[str, Mapping[str, Any]], leaders: Mapping[str, Mapping[str, Any]]
    ) -> Mapping[str, str]:
        pie_lines = []
        for key, payload in summaries.items():
            pie_lines.append(f'    "{payload["title"]}" : {payload["owner_treasury"]:.6f}')
        pie_chart = "\n".join(["pie showData", *pie_lines])

        leader_flow = [
            "flowchart TD",
            "    A[Day-One Scoreboard] --> B[Utility Leader]",
            f"    B -->|{leaders['utility_uplift']['title']}| C{{Utility}}",
            "    A --> D[Treasury Leader]",
            f"    D -->|{leaders['owner_treasury']['title']}| E{{Owner Treasury}}",
            "    A --> F[Reliability Leader]",
            f"    F -->|{leaders['reliability']['title']}| G{{Reliability}}",
            "    A --> H[Latency Champion]",
            f"    H -->|{leaders['latency_delta']['title']}| I{{Latency}}",
            "    A --> J[P95 Sentinel]",
            f"    J -->|{leaders['latency_p95']['title']}| K{{Latency P95}}",
        ]

        guardrail_overview = ["graph LR"]
        for key, payload in summaries.items():
            guardrail = payload["guardrail_pass"]
            status = "Stable" if all(guardrail.values()) else "Investigate"
            guardrail_overview.append(
                f"    {key.replace('-', '_')}[{payload['title']}] --> {status}"
            )

        return {
            "treasury": pie_chart.strip(),
            "leaders": "\n".join(leader_flow).strip(),
            "guardrails": "\n".join(guardrail_overview).strip(),
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
        utility_override_value = owner_controls.get("utility_threshold_override_bps")
        if utility_override_value is None:
            utility_override_display = "—"
        else:
            utility_override_display = f"{int(utility_override_value)} bps"
        latency_override_value = owner_controls.get("latency_threshold_override_bps")
        if latency_override_value is None:
            latency_override_display = "—"
        else:
            latency_override_display = f"{int(latency_override_value)} bps"
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
                        <div class="metric"><h3>Latency P95</h3><p>{metrics['latency_p95']:.3f}s</p></div>
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
                            <p><strong>Utility Guardrail:</strong> {owner_controls['utility_threshold_active']:.4f}</p>
                            <p><strong>Utility Override:</strong> {utility_override_display}</p>
                            <p><strong>Latency Guardrail:</strong> {owner_controls['latency_threshold_active']:.4f}</p>
                            <p><strong>Latency Override:</strong> {latency_override_display}</p>
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

    def _render_scoreboard_html(self, scoreboard: Mapping[str, Any]) -> Path:
        strategies = scoreboard["strategies"]
        aggregates = scoreboard["aggregates"]
        guardrail_failures: Sequence[Mapping[str, Any]] = scoreboard.get("guardrail_failures", [])
        mermaid_blocks = scoreboard.get("mermaid", {})
        leaders = scoreboard.get("leaders", {})

        def _format_pct(value: float) -> str:
            return f"{value * 100:.2f}%"

        rows = []
        for key, payload in sorted(
            strategies.items(), key=lambda item: item[1]["utility_uplift"], reverse=True
        ):
            guardrail = payload["guardrail_pass"]
            guardrail_badge = "pass" if all(guardrail.values()) else "fail"
            rows.append(
                """
                <tr>
                    <td>{title}</td>
                    <td>{utility}</td>
                    <td>{latency}</td>
                    <td>{latency_p95:.3f}s</td>
                    <td>{treasury:.2f}</td>
                    <td>{reliability:.2f}</td>
                    <td><span class="badge {badge}">{status}</span></td>
                    <td><a href="{dashboard}" target="_blank" rel="noopener">Dashboard</a></td>
                </tr>
                """.format(
                    title=payload["title"],
                    utility=_format_pct(payload["utility_uplift"]),
                    latency=_format_pct(payload["latency_delta"]),
                    latency_p95=payload["latency_p95"],
                    treasury=payload["owner_treasury"],
                    reliability=payload["reliability_score"] * 100,
                    badge=guardrail_badge,
                    status="All Guardrails" if guardrail_badge == "pass" else "Investigate",
                    dashboard=payload["dashboard_path"],
                )
            )

        guardrail_notes = "".join(
            f"<li><strong>{item['title']}</strong>: {', '.join(item['failed'])}</li>" for item in guardrail_failures
        ) or "<li>All monitored strategies satisfied guardrails.</li>"

        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8" />
            <title>Day-One Utility Scoreboard — Command Deck</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
                :root {{
                    color-scheme: dark;
                    --bg: #020617;
                    --panel: rgba(15, 23, 42, 0.82);
                    --accent: #38bdf8;
                    --text: #f8fafc;
                }}
                body {{
                    margin: 0;
                    font-family: 'Space Grotesk', sans-serif;
                    background: radial-gradient(circle at top, rgba(56,189,248,0.18), transparent 45%), var(--bg);
                    color: var(--text);
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                }}
                header {{
                    text-align: center;
                    padding: 2.8rem 5vw 1.4rem;
                }}
                header h1 {{
                    font-size: clamp(2.6rem, 5vw, 3.8rem);
                    margin-bottom: 0.6rem;
                }}
                header p {{
                    margin: 0 auto;
                    max-width: 70ch;
                    color: rgba(248,250,252,0.76);
                    line-height: 1.5;
                }}
                main {{
                    flex: 1;
                    padding: 0 5vw 4rem;
                    display: grid;
                    gap: 1.4rem;
                }}
                .card {{
                    background: var(--panel);
                    border-radius: 22px;
                    padding: 2rem;
                    box-shadow: 0 40px 120px rgba(56,189,248,0.2);
                    backdrop-filter: blur(14px);
                }}
                table {{
                    width: 100%;
                    border-collapse: collapse;
                }}
                th, td {{
                    padding: 0.9rem;
                    border-bottom: 1px solid rgba(148,163,184,0.24);
                    text-align: left;
                }}
                th {{
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    font-size: 0.85rem;
                }}
                .badge {{
                    display: inline-block;
                    padding: 0.2rem 0.7rem;
                    border-radius: 999px;
                    font-size: 0.75rem;
                    letter-spacing: 0.05em;
                }}
                .badge.pass {{
                    background: rgba(34,197,94,0.18);
                    color: #bbf7d0;
                }}
                .badge.fail {{
                    background: rgba(248,113,113,0.2);
                    color: #fecaca;
                }}
                ul {{
                    margin: 0;
                    padding-left: 1.4rem;
                    line-height: 1.5;
                }}
                footer {{
                    text-align: center;
                    padding: 2.4rem 0;
                    color: rgba(226,232,240,0.7);
                }}
                a {{
                    color: var(--accent);
                }}
            </style>
        </head>
        <body>
            <header>
                <h1>Day-One Utility Scoreboard</h1>
                <p>
                    Aggregated telemetry across strategies proves the operator can command
                    a sovereign labour market in one sweep. Leaders are crowned live,
                    guardrails stay visible, and every dashboard remains one click away.
                </p>
            </header>
            <main>
                <section class="card">
                    <h2>Strategy Leaderboard</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Strategy</th>
                                <th>Utility Uplift</th>
                                <th>Latency Delta</th>
                                <th>P95 Latency</th>
                                <th>Owner Treasury</th>
                                <th>Reliability</th>
                                <th>Guardrails</th>
                                <th>Explore</th>
                            </tr>
                        </thead>
                        <tbody>
                            {''.join(rows)}
                        </tbody>
                    </table>
                </section>
                <section class="card">
                    <h2>Aggregates</h2>
                    <ul>
                        <li>Total owner treasury impact: {aggregates['total_owner_treasury']:.2f}</li>
                        <li>Average utility uplift: {_format_pct(aggregates['average_utility_uplift'])}</li>
                        <li>Average latency delta: {_format_pct(aggregates['average_latency_delta'])}</li>
                        <li>Average latency P95: {aggregates['average_latency_p95']:.3f}s</li>
                        <li>Utility leader: {leaders.get('utility_uplift', {}).get('title', '—')} ({_format_pct(leaders.get('utility_uplift', {}).get('value', {}).get('utility_uplift', 0.0))})</li>
                        <li>Treasury leader: {leaders.get('owner_treasury', {}).get('title', '—')} ({leaders.get('owner_treasury', {}).get('value', {}).get('owner_treasury', 0.0):.2f})</li>
                        <li>Reliability leader: {leaders.get('reliability', {}).get('title', '—')} ({leaders.get('reliability', {}).get('value', {}).get('reliability_score', 0.0)*100:.2f})</li>
                        <li>P95 latency champion: {leaders.get('latency_p95', {}).get('title', '—')} ({leaders.get('latency_p95', {}).get('value', {}).get('latency_p95', 0.0):.3f}s)</li>
                    </ul>
                </section>
                <section class="card">
                    <h2>Guardrail Watchlist</h2>
                    <ul>{guardrail_notes}</ul>
                </section>
                <section class="card">
                    <h2>Mermaid Intels</h2>
                    <div class="mermaid">{mermaid_blocks.get('treasury', '')}</div>
                    <div class="mermaid">{mermaid_blocks.get('leaders', '')}</div>
                    <div class="mermaid">{mermaid_blocks.get('guardrails', '')}</div>
                </section>
            </main>
            <footer>
                Generated at {scoreboard['generated_at']} · Powered by AGI Jobs v0 (v2)
            </footer>
            <script type="module">
                import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
                mermaid.initialize({{ startOnLoad: true, theme: 'dark' }});
            </script>
        </body>
        </html>
        """

        html_path = self.output_dir / "scoreboard.html"
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
            choices=("json", "human"),
            default="json",
            help="Output format for operator consoles. JSON remains automation-friendly, human emits a narrative summary.",
        )

        owner = subparsers.add_parser("owner", help="View or update owner controls")
        owner.add_argument("--show", action="store_true", help="Display the current owner configuration")
        owner.add_argument("--set", nargs=2, metavar=("KEY", "VALUE"), help="Update a specific owner control")
        owner.add_argument(
            "--toggle-pause", action="store_true", help="Toggle the paused state for the orchestrator"
        )
        owner.add_argument(
            "--reset", action="store_true", help="Restore owner controls to the default sovereign configuration"
        )

        subparsers.add_parser("list", help="List available strategies")
        scoreboard = subparsers.add_parser(
            "scoreboard", help="Generate a multi-strategy scoreboard and dashboard"
        )
        scoreboard.add_argument(
            "--strategies",
            nargs="*",
            help="Optional list of strategy keys to include (defaults to all)",
        )
        return parser

    def execute(self, args: Optional[Sequence[str]] = None) -> Tuple[Mapping[str, Any], str]:
        parser = self.build_parser()
        parsed = parser.parse_args(args=args)
        command = parsed.command or "simulate"
        if command == "simulate":
            report = self.simulate(parsed.strategy)
            output_format = getattr(parsed, "format", "json")
            if output_format == "human":
                summary = self._build_human_summary(report)
                return {"report": report, "summary": summary}, "human"
            return report, "json"
        if command == "owner":
            if parsed.reset:
                snapshot = self.reset_owner_controls()
                return {"owner_controls": snapshot, "status": "reset"}, "json"
            if parsed.toggle_pause:
                snapshot = self.toggle_pause()
                return {"owner_controls": snapshot}, "json"
            if parsed.set:
                key, value = parsed.set
                snapshot = self.update_owner_control(key, value)
                return {"owner_controls": snapshot}, "json"
            snapshot = self.load_owner_controls()
            return {"owner_controls": snapshot}, "json"
        if command == "list":
            strategies = {key: profile.title for key, profile in self.load_strategies().items()}
            return {"strategies": strategies}, "json"
        if command == "scoreboard":
            strategy_args = getattr(parsed, "strategies", None)
            scoreboard_payload = self.scoreboard(strategy_args)
            return scoreboard_payload, "json"
        raise ValueError(f"Unknown command {command}")

    def _build_human_summary(self, report: Mapping[str, Any]) -> str:
        profile = report["strategy_profile"]
        metrics = report["metrics"]
        guardrails = report["guardrail_pass"]
        owner_snapshot = report["owner_controls"]
        utility_pct = metrics["utility_uplift"] * 100
        latency_pct = metrics["latency_delta"] * 100
        lines = [
            f"Strategy: {profile['title']} ({report['strategy']})",
            f"Utility uplift: {utility_pct:.2f}% — Guardrail {'PASSED' if guardrails['utility_uplift'] else 'BLOCKED'}",
            f"Latency delta: {latency_pct:.2f}% — Guardrail {'PASSED' if guardrails['latency_delta'] else 'BLOCKED'}",
            f"P95 latency: {metrics['latency_p95']:.3f}s",
            f"Reliability score: {profile['reliability_score']*100:.1f} — {'Operational' if guardrails['reliability_score'] else 'Investigate'}",
            f"Owner treasury (fees + bonuses): {metrics['owner_treasury']:.2f}",
            "Highlights:",
        ]
        for bullet in profile["highlights"]:
            lines.append(f"  • {bullet}")
        lines.extend(
            [
                "Owner controls:",
                f"  • Owner: {owner_snapshot['owner_address']}",
                f"  • Treasury: {owner_snapshot['treasury_address']}",
                f"  • Platform fee: {owner_snapshot['platform_fee_bps']} bps",
                f"  • Utility guardrail: {owner_snapshot['utility_threshold_active']:.4f}",
                f"  • Latency guardrail: {owner_snapshot['latency_threshold_active']}",
                f"  • Narrative: {owner_snapshot['narrative']}",
                "Outputs:",
                f"  • Dashboard: {report['outputs']['dashboard']}",
                f"  • Snapshot: {report['outputs']['chart']}",
            ]
        )
        return "\n".join(lines)


def run_cli(args: Optional[Sequence[str]] = None) -> Tuple[Mapping[str, Any], str]:
    """Run the demo CLI with backwards-compatible argument handling."""

    orchestrator = DayOneUtilityOrchestrator()
    normalized_args: Optional[List[str]]

    if args is None:
        # Read from sys.argv so we can normalise old-style invocations such as
        # `python run_demo.py --strategy e2e` which predate the subcommand
        # interface. We normalise rather than rely on argparse errors so the
        # CLI feels forgiving to non-technical operators following earlier docs.
        normalized_args = list(sys.argv[1:])
    else:
        normalized_args = list(args)

    if normalized_args is None:
        return orchestrator.execute(None)

    if not normalized_args:
        normalized_args = ["simulate"]
    else:
        primary = normalized_args[0]
        known_commands = {"simulate", "owner", "list", "scoreboard"}
        if primary not in known_commands and not primary.startswith("-"):
            # Allow operators to call `python run_demo.py e2e` and treat the
            # first positional argument as the strategy name. This mirrors the
            # friendly interface described in the scaffold request.
            normalized_args = ["simulate", "--strategy", primary, *normalized_args[1:]]
        elif primary.startswith("-"):
            # Any flag-only invocation should default to the simulate command.
            normalized_args = ["simulate", *normalized_args]

    return orchestrator.execute(normalized_args)


def main() -> None:
    payload, format_hint = run_cli()
    if format_hint == "human":
        summary = payload.get("summary", "")
        print(summary)
    else:
        print(json.dumps(payload, indent=2))


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    main()
