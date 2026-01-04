from __future__ import annotations

from datetime import datetime, timezone

from services.thermostat.metrics import MetricSample


def test_metric_sample_accepts_iso_timestamp_with_z_suffix() -> None:
    payload = {"timestamp": "2024-05-01T12:00:00Z", "roi": 1.25}

    sample = MetricSample.from_payload(payload)

    assert sample.timestamp == datetime(2024, 5, 1, 12, 0, tzinfo=timezone.utc)
    assert sample.roi == 1.25
