#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Iterable, Optional


def _load_latest_report(out_dir: Path) -> Optional[dict[str, Any]]:
    candidates: Iterable[Path] = sorted(out_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in candidates:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if _extract_uplift(data) is not None:
            return data
    return None


def _extract_uplift(report: dict[str, Any]) -> Optional[float]:
    for key in ("uplift_pct", "utility_uplift", "utility_uplift_pct"):
        value = report.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    metrics = report.get("metrics")
    if isinstance(metrics, dict):
        baseline = metrics.get("baseline", {})
        candidate = metrics.get("candidate", {})
        base_val = baseline.get("utility") if isinstance(baseline, dict) else None
        cand_val = candidate.get("utility") if isinstance(candidate, dict) else None
        if isinstance(base_val, (int, float)) and isinstance(cand_val, (int, float)) and base_val != 0:
            return (cand_val - base_val) / base_val
    return None


def main() -> None:
    out_arg = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("out")
    report = _load_latest_report(out_arg)
    if not report:
        print("✅ Day-One run complete")
        return
    uplift = _extract_uplift(report)
    if isinstance(uplift, (int, float)):
        value = float(uplift)
        if abs(value) <= 1:
            value *= 100.0
        print(f"✅ Day-One Utility +{value:.2f}%")
    else:
        print("✅ Day-One run complete")


if __name__ == "__main__":
    main()
