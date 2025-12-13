"""Phase 8 — Universal Value Dominance demo runner.

This lightweight Python entrypoint mirrors the guardrails baked into the
TypeScript console (`scripts/run-phase8-demo.ts`). It loads the manifest,
validates key addresses, computes coverage + resilience heuristics, and
emits a JSON report for operators. Running it locally ensures the demo
stays runnable even without the Node.js toolchain. The CLI intentionally
stays minimal while supporting custom manifest/output paths to ease
orchestration in CI runners or downstream simulations.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

PHASE_ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = PHASE_ROOT / "config" / "universal.value.manifest.json"
REPORT_PATH = PHASE_ROOT / "output" / "phase8_run_report.json"
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


def load_manifest(path: Path) -> Mapping[str, Any]:
    """Load the JSON manifest with a helpful error message on failure."""
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as exc:  # pragma: no cover - guarded by test
        raise SystemExit(f"Manifest missing at {path}") from exc
    except json.JSONDecodeError as exc:  # pragma: no cover - guarded by test
        raise SystemExit(f"Manifest at {path} is not valid JSON: {exc}") from exc


def normalise_address(value: Any) -> str:
    """Return a checksummed-ish lowercase address or the zero address."""
    if isinstance(value, str) and ADDRESS_RE.match(value.strip()):
        return value.strip().lower()
    return ZERO_ADDRESS


@dataclass(frozen=True)
class PhaseMetrics:
    total_monthly_usd: float
    coverage_ratio: float
    average_resilience: float
    average_coverage_seconds: float
    guardian_review_window_seconds: int
    max_autonomy_bps: int
    autonomy_guard_cap_bps: int
    cadence_seconds: int

    @property
    def dominance_score(self) -> float:
        """Compute a bounded dominance score (0-100)."""
        value_score = 0 if self.total_monthly_usd <= 0 else min(1, self.total_monthly_usd / 500_000_000_000)
        resilience_score = max(0, min(1, self.average_resilience))
        coverage_score = min(1, (self.coverage_ratio + self.coverage_strength) / 2)
        autonomy_score = (
            min(1, self.max_autonomy_bps / self.autonomy_guard_cap_bps)
            if self.autonomy_guard_cap_bps > 0
            else 1
        )
        cadence_score = max(0, 1 - min(1, self.cadence_seconds / (24 * 60 * 60))) if self.cadence_seconds > 0 else 0.5

        weighted = 0.3 * value_score + 0.25 * resilience_score + 0.2 * coverage_score + 0.15 * autonomy_score + 0.1 * cadence_score
        return round(min(1, weighted) * 100, 1)

    @property
    def coverage_strength(self) -> float:
        if self.guardian_review_window_seconds <= 0:
            return 1
        return min(1, self.average_coverage_seconds / self.guardian_review_window_seconds)


def fmean(values: Iterable[float]) -> float:
    try:
        return statistics.fmean(values)
    except statistics.StatisticsError:
        return 0.0


def compute_metrics(manifest: Mapping[str, Any]) -> PhaseMetrics:
    streams = [stream for stream in manifest.get("capitalStreams", []) if stream.get("active", True)]
    annual_budget = sum(float(stream.get("annualBudget", 0) or 0) for stream in streams)
    total_monthly_usd = annual_budget / 12 if annual_budget else 0

    sentinels = [sentinel for sentinel in manifest.get("sentinels", []) if sentinel.get("active", True)]
    sentinel_domains = {domain for sentinel in sentinels for domain in sentinel.get("domains", [])}
    total_domains = max(1, len(manifest.get("domains", [])))
    coverage_ratio = min(1.0, len(sentinel_domains) / total_domains)

    resilience_scores = [max(0.0, 1 - float(sentinel.get("sensitivityBps", 0) or 0) / 10_000) for sentinel in sentinels]
    average_resilience = fmean(resilience_scores)
    average_coverage_seconds = fmean([float(sentinel.get("coverageSeconds", 0) or 0) for sentinel in sentinels])

    global_cfg = manifest.get("global", {})
    guardian_review_window_seconds = int(float(global_cfg.get("guardianReviewWindow", 0) or 0) * 60)

    autonomy_cfg = manifest.get("autonomy", {}).get("session", {})
    max_autonomy_hours = float(autonomy_cfg.get("maxHours", 0) or 0)
    max_autonomy_bps = int(min(10_000, max_autonomy_hours / 24 * 10_000)) if max_autonomy_hours else 0

    safety_cfg = manifest.get("safety", {})
    cadence_seconds = int(float(safety_cfg.get("checkInCadenceMinutes", 0) or 0) * 60)

    autonomy_guard_cap_bps = int(global_cfg.get("maxDrawdownBps", 10_000) or 10_000)

    return PhaseMetrics(
        total_monthly_usd=total_monthly_usd,
        coverage_ratio=coverage_ratio,
        average_resilience=average_resilience,
        average_coverage_seconds=average_coverage_seconds,
        guardian_review_window_seconds=guardian_review_window_seconds,
        max_autonomy_bps=max_autonomy_bps,
        autonomy_guard_cap_bps=autonomy_guard_cap_bps,
        cadence_seconds=cadence_seconds,
    )


def validate_addresses(global_section: Mapping[str, Any]) -> list[str]:
    invalid_keys: list[str] = []
    for key, value in global_section.items():
        if isinstance(value, str) and ADDRESS_RE.match(value.strip()):
            continue
        if isinstance(value, str) and value.strip() == "":
            continue
        # Only flag obvious address-like fields
        if "address" in key.lower() or key.lower() in {"treasury", "universalVault", "phase8Manager", "systemPause"}:
            invalid_keys.append(key)
    return invalid_keys


def save_report(metrics: PhaseMetrics, manifest: Mapping[str, Any], *, output_path: Path = REPORT_PATH) -> None:
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "totals": {
            "monthlyUSD": metrics.total_monthly_usd,
            "dominanceScore": metrics.dominance_score,
        },
        "coverage": {
            "ratio": metrics.coverage_ratio,
            "averageSeconds": metrics.average_coverage_seconds,
            "guardianReviewWindowSeconds": metrics.guardian_review_window_seconds,
        },
        "resilience": {
            "average": metrics.average_resilience,
            "cadenceSeconds": metrics.cadence_seconds,
        },
        "autonomy": {
            "maxAutonomyBps": metrics.max_autonomy_bps,
            "autonomyGuardCapBps": metrics.autonomy_guard_cap_bps,
        },
        "global": {
            "treasury": normalise_address(manifest.get("global", {}).get("treasury")),
            "phase8Manager": normalise_address(manifest.get("global", {}).get("phase8Manager")),
            "validatorRegistry": normalise_address(manifest.get("global", {}).get("validatorRegistry")),
            "systemPause": normalise_address(manifest.get("global", {}).get("systemPause")),
        },
    }
    output_path.write_text(json.dumps(report, indent=2))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=MANIFEST_PATH,
        help="Path to the universal value manifest JSON file to evaluate.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=REPORT_PATH,
        help="Where to write the generated telemetry report (JSON).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress human-readable telemetry output (still writes the report).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    manifest_path = args.manifest.resolve()
    output_path = args.output.resolve()

    manifest = load_manifest(manifest_path)
    invalid_addresses = validate_addresses(manifest.get("global", {}))
    metrics = compute_metrics(manifest)
    save_report(metrics, manifest, output_path=output_path)

    if not args.quiet:
        print("🛰️  Phase 8 — Universal Value Dominance :: Telemetry")
        print(f"• Monthly economic throughput (USD): {metrics.total_monthly_usd:,.0f}")
        print(f"• Dominance score: {metrics.dominance_score:.1f} / 100")
        print(f"• Coverage ratio: {metrics.coverage_ratio:.2%} across sentinels")
        print(f"• Average resilience: {metrics.average_resilience:.2%}")
        if invalid_addresses:
            print(f"• ⚠️  Global address fields need review: {', '.join(sorted(invalid_addresses))}")
        else:
            print("• Global address fields validated")
        display_path = output_path
        try:
            display_path = output_path.relative_to(PHASE_ROOT)
        except ValueError:
            pass
        print(f"• Report saved to {display_path}")

    return 1 if invalid_addresses else 0


if __name__ == "__main__":
    sys.exit(main())
