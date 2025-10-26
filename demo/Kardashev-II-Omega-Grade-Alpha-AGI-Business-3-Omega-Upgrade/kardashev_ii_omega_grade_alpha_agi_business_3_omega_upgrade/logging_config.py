"""Structured logging configuration for the omega upgrade."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime
from typing import Any, Dict

_LOGGER_INITIALISED = False


class JsonFormatter(logging.Formatter):
    """Minimal JSON formatter with ISO timestamps."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401 - interface contract
        payload: Dict[str, Any] = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "event"):
            payload["event"] = getattr(record, "event")
        for key, value in record.__dict__.items():
            if key.startswith("_") or key in payload or key in {"exc_info", "exc_text", "stack_info"}:
                continue
            try:
                json.dumps(value)
                payload[key] = value
            except TypeError:
                payload[key] = str(value)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging(level: int = logging.INFO) -> None:
    global _LOGGER_INITIALISED
    if _LOGGER_INITIALISED:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    _LOGGER_INITIALISED = True
