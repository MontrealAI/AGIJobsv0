from __future__ import annotations

from datetime import datetime, timezone

from services.thermostat.metrics import MetricSample


def test_metric_sample_accepts_iso_timestamp_with_z_suffix() -> None:
    payload = {"timestamp": "2024-05-01T12:00:00Z", "roi": 1.25}

    sample = MetricSample.from_payload(payload)

    assert sample.timestamp == datetime(2024, 5, 1, 12, 0, tzinfo=timezone.utc)
    assert sample.roi == 1.25


def test_metric_sample_accepts_numeric_timestamp_strings() -> None:
    payload = {"timestamp": "1714564800", "roi": 1.1}

    sample = MetricSample.from_payload(payload)

    assert sample.timestamp == datetime.fromtimestamp(1714564800, tz=timezone.utc)


def test_metric_sample_defaults_invalid_numeric_fields() -> None:
    payload = {
        "timestamp": 0,
        "roi": "not-a-number",
        "gmv": None,
        "cost": {},
        "successes": "7",
        "failures": "oops",
    }

    sample = MetricSample.from_payload(payload)

    assert sample.timestamp == datetime.fromtimestamp(0, tz=timezone.utc)
    assert sample.roi == 0.0
    assert sample.gmv == 0.0
    assert sample.cost == 0.0
    assert sample.successes == 7
    assert sample.failures == 0
