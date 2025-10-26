"""Structured logging utilities for the Omega-grade demo."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict


class JsonFormatter(logging.Formatter):
    """Render log records as structured JSON objects."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401 - inherited docstring
        base: Dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            base["exception"] = self.formatException(record.exc_info)
        if record.__dict__:
            extra = {
                k: v
                for k, v in record.__dict__.items()
                if k not in {
                    "name",
                    "msg",
                    "args",
                    "levelname",
                    "levelno",
                    "pathname",
                    "filename",
                    "module",
                    "exc_info",
                    "exc_text",
                    "stack_info",
                    "lineno",
                    "funcName",
                    "created",
                    "msecs",
                    "relativeCreated",
                    "thread",
                    "threadName",
                    "processName",
                    "process",
                    "message",
                }
            }
            if extra:
                base.update(extra)
        return json.dumps(base, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    """Configure root logger for JSON output."""

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()
    root.addHandler(handler)
