"""Logging helpers for the Kardashev-II Omega-Grade α-AGI Business 3 demo."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict


class _JsonFormatter(logging.Formatter):
    """Minimal JSON formatter to avoid external dependencies."""

    default_time_format = "%Y-%m-%dT%H:%M:%S"
    default_msec_format = "%s.%03d"

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401 - customizing base method
        payload: Dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "event"):
            payload["event"] = getattr(record, "event")
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        for key, value in getattr(record, "__dict__", {}).items():
            if key.startswith("_"):
                continue
            if key in payload or key in {"args", "msg", "message", "levelname", "levelno", "pathname", "filename", "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName", "created", "msecs", "relativeCreated", "thread", "threadName", "processName", "process", "event"}:
                continue
            payload[key] = value
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def configure_logging(level: str | int | None = None) -> None:
    """Configure root logging with JSON output.

    Parameters
    ----------
    level:
        Optional override for the logging level. If omitted the LOG_LEVEL environment
        variable is used, defaulting to ``INFO``.
    """

    resolved_level: int
    if level is None:
        env_level = os.getenv("LOG_LEVEL", "INFO")
        resolved_level = logging.getLevelName(env_level.upper())  # type: ignore[assignment]
        if not isinstance(resolved_level, int):
            resolved_level = logging.INFO
    elif isinstance(level, str):
        resolved_level = logging.getLevelName(level.upper())  # type: ignore[assignment]
        if not isinstance(resolved_level, int):
            resolved_level = logging.INFO
    else:
        resolved_level = level

    root_logger = logging.getLogger()
    if root_logger.handlers:
        for handler in root_logger.handlers:
            handler.setFormatter(_JsonFormatter())
        root_logger.setLevel(resolved_level)
        return

    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root_logger.addHandler(handler)
    root_logger.setLevel(resolved_level)
    root_logger.propagate = False

    # Provide a structured startup log so operators know logging is ready.
    root_logger.info(
        "logging_configured",
        extra={
            "event": "logging_configured",
            "level": logging.getLevelName(resolved_level),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
