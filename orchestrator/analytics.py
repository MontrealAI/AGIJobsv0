"""Analytics aggregation utilities for CMS and SPG metrics."""

from __future__ import annotations

import csv
import json
import os
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterator, List, Mapping, Sequence, Tuple

try:  # Optional dependency for Parquet export
    import pyarrow as pa  # type: ignore
    import pyarrow.parquet as pq  # type: ignore
except Exception:  # pragma: no cover - pyarrow is optional
    pa = None  # type: ignore
    pq = None  # type: ignore


_DEFAULT_ANALYTICS_DIR = Path(os.environ.get("ANALYTICS_SOURCE_DIR", "demo/CULTURE-v0/data/analytics"))
_DEFAULT_OUTPUT_DIR = Path(os.environ.get("ANALYTICS_OUTPUT_DIR", "storage/analytics"))
_DEFAULT_REPORTS_DIR = Path(os.environ.get("ANALYTICS_REPORT_DIR", "reports"))


@dataclass(slots=True)
class CMSMetrics:
    """Composite CMS metrics derived from culture snapshots."""

    artifact_count: int
    citation_depth: float
    influence_dispersion: float
    reuse: int

    def to_dict(self) -> Dict[str, float]:
        return {
            "artifactCount": self.artifact_count,
            "citationDepth": round(self.citation_depth, 2),
            "influenceDispersion": round(self.influence_dispersion, 4),
            "reuse": self.reuse,
        }


@dataclass(slots=True)
class SPGMetrics:
    """Self-play governance metrics computed from arena snapshots."""

    elo_deltas: Mapping[str, float]
    difficulty_trend: float
    validator_honesty: float

    def to_dict(self) -> Dict[str, object]:
        return {
            "eloDeltas": {address: round(delta, 2) for address, delta in self.elo_deltas.items()},
            "difficultyTrend": round(self.difficulty_trend, 3),
            "validatorHonesty": round(self.validator_honesty, 3),
        }


@dataclass(slots=True)
class WeeklyAnalytics:
    week: str
    generated_at: str
    cms: CMSMetrics
    spg: SPGMetrics
    raw_culture: Mapping[str, object]
    raw_arena: Mapping[str, object]

    def to_dict(self) -> Dict[str, object]:
        return {
            "week": self.week,
            "generatedAt": self.generated_at,
            "cms": self.cms.to_dict(),
            "spg": self.spg.to_dict(),
            "culture": self.raw_culture,
            "arena": self.raw_arena,
        }


class AnalyticsError(RuntimeError):
    """Raised when analytics collection fails."""


class AnalyticsEngine:
    """Aggregate CMS/SPG analytics from weekly JSON snapshots."""

    def __init__(
        self,
        analytics_dir: Path | None = None,
        output_dir: Path | None = None,
        reports_dir: Path | None = None,
    ) -> None:
        self._analytics_dir = (analytics_dir or _DEFAULT_ANALYTICS_DIR).resolve()
        self._output_dir = (output_dir or _DEFAULT_OUTPUT_DIR).resolve()
        self._reports_dir = (reports_dir or _DEFAULT_REPORTS_DIR).resolve()
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._reports_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Snapshot ingestion helpers
    # ------------------------------------------------------------------
    def _iter_snapshots(self, prefix: str) -> Iterator[Tuple[str, Mapping[str, object]]]:
        pattern = f"{prefix}-week-*.json"
        if not self._analytics_dir.exists():
            return iter(())
        files = sorted(self._analytics_dir.glob(pattern))
        for file in files:
            try:
                payload = json.loads(file.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:  # pragma: no cover - invalid snapshot
                raise AnalyticsError(f"Snapshot {file} is not valid JSON: {exc}") from exc
            raw_week = payload.get("week")
            if raw_week is None:
                week = file.stem.split("-")[-1]
            else:
                week = str(raw_week).strip()
                if not week:
                    week = file.stem.split("-")[-1]
            yield week, payload

    def _load_snapshots(self) -> Tuple[Dict[str, Mapping[str, object]], Dict[str, Mapping[str, object]]]:
        culture = {week: payload for week, payload in self._iter_snapshots("culture")}
        arena = {week: payload for week, payload in self._iter_snapshots("arena")}
        if not culture or not arena:
            raise AnalyticsError(
                f"Expected both culture and arena snapshots in {self._analytics_dir}; "
                f"found {len(culture)} culture and {len(arena)} arena entries."
            )
        return culture, arena

    # ------------------------------------------------------------------
    # Metric calculations
    # ------------------------------------------------------------------
    @staticmethod
    def _extract_number(payload: Mapping[str, object], *keys: str, default: float = 0.0) -> float:
        current: object = payload
        for key in keys:
            if not isinstance(current, Mapping):
                return default
            current = current.get(key)
        if isinstance(current, (int, float)):
            return float(current)
        if isinstance(current, str) and current:
            try:
                return float(current)
            except ValueError:
                return default
        return default

    def _cms_metrics(self, culture: Mapping[str, object]) -> CMSMetrics:
        created = int(self._extract_number(culture, "artifacts", "created", default=0))
        depth = self._extract_number(culture, "artifacts", "maxLineageDepth", default=0.0)
        gini = self._extract_number(culture, "influence", "influenceGini", default=0.0)
        reuse = int(self._extract_number(culture, "influence", "derivativeJobs", default=0))
        return CMSMetrics(
            artifact_count=created,
            citation_depth=depth,
            influence_dispersion=gini,
            reuse=reuse,
        )

    def _elo_deltas(
        self,
        week: str,
        arena_by_week: Mapping[str, Mapping[str, object]],
    ) -> Mapping[str, float]:
        leaderboard = arena_by_week.get(week, {}).get("elo")
        if not isinstance(leaderboard, Mapping):
            return {}
        entries = leaderboard.get("leaderboard")
        if not isinstance(entries, Sequence):
            return {}

        deltas: Dict[str, float] = {}
        for entry in entries:
            if not isinstance(entry, Mapping):
                continue
            address = str(entry.get("address"))
            rating = self._extract_number(entry, "rating", default=0.0)
            baseline = self._find_previous_rating(address, week, arena_by_week)
            if not address:
                continue
            deltas[address] = rating - baseline
        return deltas

    def _find_previous_rating(
        self,
        address: str,
        current_week: str,
        arena_by_week: Mapping[str, Mapping[str, object]],
    ) -> float:
        weeks = sorted(arena_by_week.keys())
        try:
            current_index = weeks.index(current_week)
        except ValueError:
            return 0.0
        for idx in range(current_index - 1, -1, -1):
            prior_week = weeks[idx]
            leaderboard = arena_by_week.get(prior_week, {}).get("elo")
            if not isinstance(leaderboard, Mapping):
                continue
            entries = leaderboard.get("leaderboard")
            if not isinstance(entries, Sequence):
                continue
            for entry in entries:
                if not isinstance(entry, Mapping):
                    continue
                if str(entry.get("address")) != address:
                    continue
                rating = self._extract_number(entry, "rating", default=0.0)
                if rating:
                    return rating
        return 0.0

    def _validator_honesty(self, arena: Mapping[str, object]) -> float:
        executed = self._extract_number(arena, "rounds", "finalized", default=0.0)
        slashed = self._extract_number(arena, "rounds", "slashed", default=0.0)
        if executed <= 0:
            return 1.0
        honesty = max(0.0, min(1.0, 1.0 - (slashed / executed)))
        return honesty

    def _spg_metrics(
        self,
        week: str,
        arena: Mapping[str, object],
        arena_by_week: Mapping[str, Mapping[str, object]],
    ) -> SPGMetrics:
        deltas = self._elo_deltas(week, arena_by_week)
        difficulty_trend = self._extract_number(arena, "rounds", "difficultyDelta", "mean", default=0.0)
        honesty = self._validator_honesty(arena)
        return SPGMetrics(
            elo_deltas=deltas,
            difficulty_trend=difficulty_trend,
            validator_honesty=honesty,
        )

    # ------------------------------------------------------------------
    def collect(self) -> List[WeeklyAnalytics]:
        culture_by_week, arena_by_week = self._load_snapshots()
        weeks = sorted(set(culture_by_week.keys()) & set(arena_by_week.keys()))
        reports: List[WeeklyAnalytics] = []
        for week in weeks:
            culture = culture_by_week[week]
            arena = arena_by_week[week]
            generated_at = str(culture.get("generatedAt") or arena.get("generatedAt") or "")
            cms = self._cms_metrics(culture)
            spg = self._spg_metrics(week, arena, arena_by_week)
            reports.append(
                WeeklyAnalytics(
                    week=week,
                    generated_at=generated_at,
                    cms=cms,
                    spg=spg,
                    raw_culture=culture,
                    raw_arena=arena,
                )
            )
        if not reports:
            raise AnalyticsError("No overlapping culture/arena weeks found")
        return reports

    # ------------------------------------------------------------------
    def _latest(self, reports: Sequence[WeeklyAnalytics]) -> WeeklyAnalytics:
        return sorted(reports, key=lambda report: report.week)[-1]

    # ------------------------------------------------------------------
    def write_outputs(self, reports: Sequence[WeeklyAnalytics]) -> Path:
        latest = self._latest(reports)
        latest_path = self._output_dir / "latest.json"
        latest_payload = json.dumps([report.to_dict() for report in reports], indent=2)
        latest_path.write_text(f"{latest_payload}\n", encoding="utf-8")
        history_path = self._write_history(reports)
        self._write_reports(reports)
        self._pin_to_ipfs([latest_path, history_path, history_path.with_suffix(".parquet")])
        return latest_path

    def _write_history(self, reports: Sequence[WeeklyAnalytics]) -> Path:
        fieldnames = [
            "week",
            "generated_at",
            "artifact_count",
            "citation_depth",
            "influence_dispersion",
            "reuse",
            "difficulty_trend",
            "validator_honesty",
        ]
        history_path = self._output_dir / "history.csv"
        with history_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for report in reports:
                writer.writerow(
                    {
                        "week": report.week,
                        "generated_at": report.generated_at,
                        "artifact_count": report.cms.artifact_count,
                        "citation_depth": f"{report.cms.citation_depth:.2f}",
                        "influence_dispersion": f"{report.cms.influence_dispersion:.4f}",
                        "reuse": report.cms.reuse,
                        "difficulty_trend": f"{report.spg.difficulty_trend:.3f}",
                        "validator_honesty": f"{report.spg.validator_honesty:.3f}",
                    }
                )
        self._write_parquet(reports, history_path)
        return history_path

    def _write_parquet(self, reports: Sequence[WeeklyAnalytics], csv_path: Path) -> None:
        if not pa or not pq:  # pragma: no cover - pyarrow optional
            return
        table = pa.table(
            {
                "week": [report.week for report in reports],
                "generated_at": [report.generated_at for report in reports],
                "artifact_count": [report.cms.artifact_count for report in reports],
                "citation_depth": [report.cms.citation_depth for report in reports],
                "influence_dispersion": [report.cms.influence_dispersion for report in reports],
                "reuse": [report.cms.reuse for report in reports],
                "difficulty_trend": [report.spg.difficulty_trend for report in reports],
                "validator_honesty": [report.spg.validator_honesty for report in reports],
            }
        )
        parquet_path = csv_path.with_suffix(".parquet")
        pq.write_table(table, parquet_path)

    def _pin_to_ipfs(self, artifacts: Sequence[Path]) -> None:
        flag = os.environ.get("ANALYTICS_IPFS_PIN", "")
        if flag.lower() not in {"1", "true", "yes"}:
            return
        script = Path(os.environ.get("ANALYTICS_IPFS_SCRIPT", "scripts/pin_to_ipfs.mjs")).resolve()
        if not script.exists():
            print(f"Analytics IPFS script not found at {script}")
            return
        manifest: Dict[str, object] = {}
        for artifact in artifacts:
            if not artifact.exists():
                continue
            try:
                result = subprocess.run(
                    ["node", str(script), str(artifact)],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            except FileNotFoundError:  # pragma: no cover - node missing in some envs
                print("Node.js not available; skipping IPFS pin")
                return
            except subprocess.CalledProcessError as exc:  # pragma: no cover - log failure
                print(f"IPFS pin failed for {artifact}: {exc.stderr or exc.stdout}")
                continue
            try:
                manifest[artifact.name] = json.loads(result.stdout or "{}")
            except json.JSONDecodeError:
                manifest[artifact.name] = {"stdout": result.stdout.strip()}
        if manifest:
            manifest_path = self._output_dir / "ipfs.json"
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------
    def _write_reports(self, reports: Sequence[WeeklyAnalytics]) -> None:
        culture_report = self._reports_dir / "culture-weekly.md"
        arena_report = self._reports_dir / "arena-weekly.md"
        culture_report.write_text(self._render_culture_report(reports), encoding="utf-8")
        arena_report.write_text(self._render_arena_report(reports), encoding="utf-8")

    def _render_culture_report(self, reports: Sequence[WeeklyAnalytics]) -> str:
        lines = [
            "# Culture Analytics Weekly Report",
            "",
            "This report summarises CMS metrics across the most recent culture snapshots.",
            "",
        ]
        latest = self._latest(reports)
        lines.extend(
            [
                f"**Week:** {latest.week}",
                f"**Generated:** {latest.generated_at or 'n/a'}",
                "",
                "| Metric | Value |",
                "| --- | --- |",
                f"| Artifact Count | {latest.cms.artifact_count} |",
                f"| Citation Depth | {latest.cms.citation_depth:.2f} |",
                f"| Influence Dispersion (Gini) | {latest.cms.influence_dispersion:.4f} |",
                f"| Reuse (Derivative Jobs) | {latest.cms.reuse} |",
                "",
            ]
        )
        lines.append("```mermaid")
        lines.append("%%{init: { 'theme': 'forest' }}%%")
        lines.append("line")
        lines.append("    title CMS Artifact Velocity")
        lines.append("    xAxis Week")
        lines.append("    yAxis Artifacts")
        artifact_series = ", ".join(str(report.cms.artifact_count) for report in reports)
        week_labels = ", ".join(report.week for report in reports)
        lines.append(f"    series Artifacts [{artifact_series}]")
        lines.append(f"    labels [{week_labels}]")
        lines.append("```")
        lines.append("")
        lines.append("```mermaid")
        lines.append("%%{init: { 'theme': 'forest' }}%%")
        lines.append("line")
        lines.append("    title Citation Depth Trend")
        lines.append("    xAxis Week")
        lines.append("    yAxis Depth")
        depth_series = ", ".join(f"{report.cms.citation_depth:.2f}" for report in reports)
        lines.append(f"    series Depth [{depth_series}]")
        lines.append(f"    labels [{week_labels}]")
        lines.append("```")
        lines.append("")
        return "\n".join(lines)

    def _render_arena_report(self, reports: Sequence[WeeklyAnalytics]) -> str:
        lines = [
            "# Arena Analytics Weekly Report",
            "",
            "Self-play governance (SPG) metrics derived from arena activity.",
            "",
        ]
        latest = self._latest(reports)
        lines.extend(
            [
                f"**Week:** {latest.week}",
                f"**Generated:** {latest.generated_at or 'n/a'}",
                "",
                "| Metric | Value |",
                "| --- | --- |",
                f"| Difficulty Trend (Δ) | {latest.spg.difficulty_trend:.3f} |",
                f"| Validator Honesty | {latest.spg.validator_honesty:.3f} |",
                f"| Elo Deltas Tracked | {len(latest.spg.elo_deltas)} agents |",
                "",
            ]
        )
        lines.append("```mermaid")
        lines.append("%%{init: { 'theme': 'neutral' }}%%")
        lines.append("line")
        lines.append("    title Validator Honesty")
        lines.append("    xAxis Week")
        lines.append("    yAxis Honesty")
        honesty_series = ", ".join(f"{report.spg.validator_honesty:.3f}" for report in reports)
        week_labels = ", ".join(report.week for report in reports)
        lines.append(f"    series Honesty [{honesty_series}]")
        lines.append(f"    labels [{week_labels}]")
        lines.append("```")
        lines.append("")
        # Elo deltas table
        lines.append("## Latest Elo Deltas")
        lines.append("")
        lines.append("| Address | Δ Rating |")
        lines.append("| --- | ---:|")
        for address, delta in sorted(latest.spg.elo_deltas.items(), key=lambda item: item[1], reverse=True):
            lines.append(f"| `{address}` | {delta:.2f} |")
        if not latest.spg.elo_deltas:
            lines.append("| _No rating changes observed_ | 0.00 |")
        lines.append("")
        return "\n".join(lines)


# ----------------------------------------------------------------------
# Shared scheduler/cache utilities
# ----------------------------------------------------------------------

class AnalyticsCache:
    """Thread-safe in-memory cache of the latest analytics bundle."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._payload: List[WeeklyAnalytics] | None = None
        self._last_updated: float | None = None

    def update(self, payload: Sequence[WeeklyAnalytics]) -> None:
        with self._lock:
            self._payload = list(payload)
            self._last_updated = time.time()

    def snapshot(self) -> Dict[str, object]:
        with self._lock:
            reports = list(self._payload) if self._payload else []
            last_updated = self._last_updated
        return {
            "lastUpdated": (
                datetime.fromtimestamp(last_updated, tz=timezone.utc).isoformat().replace("+00:00", "Z")
                if last_updated
                else None
            ),
            "reports": [report.to_dict() for report in reports],
        }


class AnalyticsScheduler:
    """Background scheduler that periodically recomputes analytics."""

    def __init__(
        self,
        engine: AnalyticsEngine,
        cache: AnalyticsCache,
        interval_seconds: int | None = None,
    ) -> None:
        self._engine = engine
        self._cache = cache
        self._interval = interval_seconds or int(os.environ.get("ANALYTICS_REFRESH_INTERVAL", "3600"))
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, daemon=True, name="analytics-scheduler")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            self._execute_once()
            self._stop_event.wait(self._interval)

    def _execute_once(self) -> None:
        try:
            reports = self._engine.collect()
            self._engine.write_outputs(reports)
            self._cache.update(reports)
        except Exception as exc:  # pragma: no cover - logging side-effects handled upstream
            print(f"Analytics scheduler failed: {exc}")


_GLOBAL_CACHE = AnalyticsCache()


def get_cache() -> AnalyticsCache:
    return _GLOBAL_CACHE


def run_once() -> Dict[str, object]:
    engine = AnalyticsEngine()
    reports = engine.collect()
    engine.write_outputs(reports)
    _GLOBAL_CACHE.update(reports)
    return _GLOBAL_CACHE.snapshot()


__all__ = [
    "CMSMetrics",
    "SPGMetrics",
    "WeeklyAnalytics",
    "AnalyticsEngine",
    "AnalyticsScheduler",
    "AnalyticsCache",
    "AnalyticsError",
    "get_cache",
    "run_once",
]


if __name__ == "__main__":  # pragma: no cover - convenience CLI
    print(json.dumps(run_once(), indent=2))
