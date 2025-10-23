"""Cross-check analytics outputs using pandas/networkx when available."""

from __future__ import annotations

import json
from pathlib import Path

try:  # Optional heavy dependencies
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover - pandas optional
    pd = None  # type: ignore


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(history_path: Path | None = None, analytics_dir: Path | None = None) -> dict[str, object]:
    history = history_path or Path("storage/analytics/history.csv")
    analytics = analytics_dir or Path("demo/CULTURE-v0/data/analytics")
    culture_snapshots = sorted(analytics.glob("culture-week-*.json"))
    arena_snapshots = sorted(analytics.glob("arena-week-*.json"))
    if not culture_snapshots or not arena_snapshots:
        raise FileNotFoundError("No analytics snapshots found")
    pairs = {}
    for culture_file in culture_snapshots:
        week = _load_json(culture_file)["week"]
        pairs.setdefault(week, {})["culture"] = culture_file
    for arena_file in arena_snapshots:
        week = _load_json(arena_file)["week"]
        pairs.setdefault(week, {})["arena"] = arena_file

    comparisons: list[dict[str, object]] = []
    for week, files in pairs.items():
        if "culture" not in files or "arena" not in files:
            continue
        culture = _load_json(files["culture"])
        arena = _load_json(files["arena"])
        comparisons.append(
            {
                "week": week,
                "artifact_count": culture.get("artifacts", {}).get("created", 0),
                "citation_depth": culture.get("artifacts", {}).get("maxLineageDepth", 0),
                "influence_dispersion": culture.get("influence", {}).get("influenceGini", 0),
                "validator_honesty": 1
                - (arena.get("rounds", {}).get("slashed", 0) / max(arena.get("rounds", {}).get("finalized", 1), 1)),
            }
        )

    if pd is not None:
        history_df = pd.read_csv(history)
        comparison_df = pd.DataFrame(comparisons)
        merged = history_df.merge(comparison_df, on="week", suffixes=("_history", "_raw"))
        deltas = {
            column: (merged[f"{column}_history"] - merged[f"{column}_raw"]).abs().max()
            for column in ["artifact_count", "citation_depth", "influence_dispersion", "validator_honesty"]
        }
    else:
        # Fallback without pandas: compute max delta manually
        import csv

        with history.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            history_entries = {row["week"]: row for row in reader}
        deltas = {}
        for comparison in comparisons:
            week = comparison["week"]
            entry = history_entries.get(week)
            if not entry:
                continue
            deltas["artifact_count"] = max(
                deltas.get("artifact_count", 0), abs(int(entry["artifact_count"]) - int(comparison["artifact_count"]))
            )
            deltas["citation_depth"] = max(
                deltas.get("citation_depth", 0),
                abs(float(entry["citation_depth"]) - float(comparison["citation_depth"])),
            )
            deltas["influence_dispersion"] = max(
                deltas.get("influence_dispersion", 0),
                abs(float(entry["influence_dispersion"]) - float(comparison["influence_dispersion"])),
            )
            deltas["validator_honesty"] = max(
                deltas.get("validator_honesty", 0),
                abs(float(entry["validator_honesty"]) - float(comparison["validator_honesty"])),
            )
    return {
        "history": str(history),
        "analytics_dir": str(analytics),
        "max_deltas": deltas,
        "snapshots_compared": len(comparisons),
    }


if __name__ == "__main__":
    result = validate()
    print(json.dumps(result, indent=2))
