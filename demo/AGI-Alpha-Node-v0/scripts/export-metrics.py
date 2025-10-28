#!/usr/bin/env python3
"""Utility script to pull metrics from a running node and print a summary table."""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import urllib.request


def fetch_metrics(url: str) -> str:
    with urllib.request.urlopen(url, timeout=10) as response:  # nosec B310
        return response.read().decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download AGI Alpha Node metrics")
    parser.add_argument("--url", default="http://localhost:9095/metrics", help="Metrics endpoint URL")
    args = parser.parse_args()

    try:
        metrics = fetch_metrics(args.url)
    except Exception as exc:  # pragma: no cover - network failure is printed to stderr
        print(f"Failed to fetch metrics: {exc}", file=sys.stderr)
        return 1

    timestamp = dt.datetime.utcnow().isoformat()
    print(f"[{timestamp}] Metrics snapshot from {args.url}\n")
    print(metrics)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
