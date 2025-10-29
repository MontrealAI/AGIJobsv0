#!/usr/bin/env python3
"""Operator CLI for the HGM thermostat controller."""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator, Iterable
from urllib import parse, request

from services.thermostat import MetricSample, ThermostatConfig, ThermostatController

from orchestrator.workflows.hgm import HGMOrchestrationWorkflow

LOGGER = logging.getLogger("thermostat.cli")


def configure_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def build_config(args: argparse.Namespace) -> ThermostatConfig:
    return ThermostatConfig(
        target_roi=args.target_roi,
        lower_margin=args.lower_margin,
        upper_margin=args.upper_margin,
        roi_window=args.window,
        widening_step=args.widening_step,
        min_widening_alpha=args.min_widening_alpha,
        max_widening_alpha=args.max_widening_alpha,
        thompson_step=args.thompson_step,
        min_thompson_prior=args.min_thompson_prior,
        max_thompson_prior=args.max_thompson_prior,
        cooldown_steps=args.cooldown,
    )


async def stream_prometheus(
    *,
    base_url: str,
    query: str,
    interval: float,
    iterations: int,
) -> AsyncIterator[MetricSample]:
    """Yield metric samples from Prometheus."""

    loop = asyncio.get_running_loop()
    count = 0
    while iterations <= 0 or count < iterations:
        count += 1
        payload = await loop.run_in_executor(None, _prometheus_query, base_url, query)
        result = payload.get("data", {}).get("result", [])
        if not result:
            LOGGER.warning("Prometheus query returned no data: %s", query)
        for vector in result:
            values = vector.get("value")
            if isinstance(values, (list, tuple)) and len(values) == 2:
                ts_raw, roi_raw = values
                timestamp = datetime.fromtimestamp(float(ts_raw), tz=timezone.utc)
                sample = MetricSample(
                    timestamp=timestamp,
                    roi=float(roi_raw),
                    gmv=0.0,
                    cost=0.0,
                )
                yield sample
        await asyncio.sleep(interval)


def _prometheus_query(base_url: str, query: str) -> dict[str, object]:
    params = parse.urlencode({"query": query})
    url = f"{base_url.rstrip('/')}/api/v1/query?{params}"
    req = request.Request(url)
    with request.urlopen(req, timeout=5) as resp:
        data = resp.read()
        payload = json.loads(data.decode("utf-8"))
    if payload.get("status") != "success":  # pragma: no cover - defensive
        raise RuntimeError(f"Prometheus query failed: {payload}")
    return payload


def load_metrics_from_path(path: Path) -> Iterable[MetricSample]:
    """Load metrics from a JSON or NDJSON file."""

    text = path.read_text()
    if path.suffix.lower() in {".json", ".ndjson"} and "\n" in text:
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            payload = json.loads(line)
            yield MetricSample.from_payload(payload)
    else:
        payload = json.loads(text)
        if isinstance(payload, list):
            for entry in payload:
                yield MetricSample.from_payload(entry)
        elif isinstance(payload, dict):
            yield MetricSample.from_payload(payload)
        else:
            raise ValueError(f"Unsupported payload structure in {path}")


async def handle_watch(args: argparse.Namespace) -> None:
    workflow = HGMOrchestrationWorkflow()
    controller = ThermostatController(
        workflow,
        build_config(args),
        apply_updates=not args.dry_run,
    )
    await controller.initialize()

    async for sample in stream_prometheus(
        base_url=args.prometheus_url,
        query=args.query,
        interval=args.interval,
        iterations=args.iterations,
    ):
        LOGGER.info("ROI %.3fx @ %s", sample.roi, sample.timestamp.isoformat())
        adjustment = await controller.ingest(sample)
        if adjustment is not None:
            fmt = ", ".join(
                f"{name} {old:.3f}->{new:.3f}" for name, (old, new) in adjustment.parameters.items()
            )
            if args.dry_run:
                LOGGER.info("Recommended adjustment (%s): %s", adjustment.reason, fmt)
            else:
                LOGGER.info("Applied adjustment (%s): %s", adjustment.reason, fmt)


async def handle_replay(args: argparse.Namespace) -> None:
    workflow = HGMOrchestrationWorkflow()
    controller = ThermostatController(
        workflow,
        build_config(args),
        apply_updates=not args.dry_run,
    )
    await controller.initialize()

    for sample in load_metrics_from_path(Path(args.path)):
        LOGGER.info("Replaying ROI %.3fx @ %s", sample.roi, sample.timestamp.isoformat())
        adjustment = await controller.ingest(sample)
        if adjustment is not None:
            fmt = ", ".join(
                f"{name} {old:.3f}->{new:.3f}" for name, (old, new) in adjustment.parameters.items()
            )
            if args.dry_run:
                LOGGER.info("Recommended adjustment (%s): %s", adjustment.reason, fmt)
            else:
                LOGGER.info("Applied adjustment (%s): %s", adjustment.reason, fmt)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Thermostat operator toolkit")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")

    sub = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--target-roi", type=float, default=2.0)
    common.add_argument("--lower-margin", type=float, default=0.1)
    common.add_argument("--upper-margin", type=float, default=0.15)
    common.add_argument("--window", type=int, default=12, help="ROI averaging window length")
    common.add_argument("--widening-step", type=float, default=0.05)
    common.add_argument("--min-widening-alpha", type=float, default=0.25)
    common.add_argument("--max-widening-alpha", type=float, default=1.5)
    common.add_argument("--thompson-step", type=float, default=0.1)
    common.add_argument("--min-thompson-prior", type=float, default=0.25)
    common.add_argument("--max-thompson-prior", type=float, default=3.0)
    common.add_argument("--cooldown", type=int, default=4, help="Cooldown steps between adjustments")
    common.add_argument("--dry-run", action="store_true", help="Report adjustments without applying")

    watch = sub.add_parser("watch", parents=[common], help="Stream metrics from Prometheus")
    watch.add_argument("--prometheus-url", default="http://localhost:9090", help="Prometheus base URL")
    watch.add_argument("--query", default="hgm_roi", help="PromQL query returning ROI as a gauge")
    watch.add_argument("--interval", type=float, default=15.0, help="Polling interval in seconds")
    watch.add_argument("--iterations", type=int, default=0, help="Number of polling iterations (0 = infinite)")

    replay = sub.add_parser("replay", parents=[common], help="Replay metrics from a JSON/NDJSON file")
    replay.add_argument("path", help="Path to the metrics file")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(args.verbose)

    command = args.command
    if command == "watch":
        asyncio.run(handle_watch(args))
    elif command == "replay":
        asyncio.run(handle_replay(args))
    else:  # pragma: no cover - argparse enforces valid subcommands
        parser.error(f"Unsupported command {command}")
    return 0


if __name__ == "__main__":  # pragma: no cover - manual execution
    sys.exit(main())
