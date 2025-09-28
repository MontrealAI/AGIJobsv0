"""Configuration helpers for the meta-orchestrator."""

from __future__ import annotations

import json
import os
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from typing import Iterable, Tuple

_CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")


def _load_json(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}


def _coerce_percentage(raw: object) -> Decimal | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float, Decimal)):
        value = Decimal(str(raw))
    elif isinstance(raw, str):
        text = raw.strip()
        if not text:
            return None
        try:
            value = Decimal(text)
        except InvalidOperation:
            return None
    else:
        return None
    if value < 0 or value > 100:
        return None
    return value


def _percent_from_sources(
    env_keys: Iterable[str],
    json_sources: Iterable[Tuple[str, str]],
    fallback: str,
) -> Decimal:
    for key in env_keys:
        raw = os.getenv(key)
        parsed = _coerce_percentage(raw)
        if parsed is not None:
            return parsed
    for rel_path, field in json_sources:
        payload = _load_json(os.path.join(_CONFIG_DIR, rel_path))
        parsed = _coerce_percentage(payload.get(field)) if payload else None
        if parsed is not None:
            return parsed
    return Decimal(fallback)


@lru_cache(maxsize=1)
def get_fee_fraction() -> Decimal:
    """Return the protocol fee as a fraction (e.g. 0.05 for 5%)."""

    percent = _percent_from_sources(
        ("ONEBOX_DEFAULT_FEE_PCT", "ONEBOX_FEE_PCT"),
        (("job-registry.json", "feePct"),),
        fallback="5",
    )
    return (percent / Decimal("100")).quantize(Decimal("0.0001"))


@lru_cache(maxsize=1)
def get_burn_fraction() -> Decimal:
    """Return the burn percentage as a fraction (e.g. 0.02 for 2%)."""

    # The burn percentage is currently sourced from runtime configuration rather than
    # the static JSON files (which reflect legacy placeholder values).  We therefore
    # intentionally skip the JSON sources and rely on environment overrides with a
    # conservative default of 2%.
    percent = _percent_from_sources(
        ("ONEBOX_DEFAULT_BURN_PCT", "ONEBOX_BURN_PCT"),
        (),
        fallback="2",
    )
    return (percent / Decimal("100")).quantize(Decimal("0.0001"))


def format_percent(value: Decimal) -> str:
    """Return a human-readable percentage string (e.g. "5%" or "2.5%")."""

    quantized = (value * Decimal("100")).quantize(Decimal("0.01"))
    text = format(quantized, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return f"{text}%"
