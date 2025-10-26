"""Structured logging utilities for the Kardashev-II Omega-Grade demo.

The demo runs for extended periods of time.  Plain text logs quickly become
unwieldy, so we log JSON objects that are easy to aggregate and query.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import logging
from typing import Any, Mapping, MutableMapping, Optional


@dataclass
class JsonLogContext:
    """Metadata persisted alongside each log record."""

    event: str
    details: MutableMapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Mapping[str, Any]:
        return {"event": self.event, **self.details}


class JsonLogFormatter(logging.Formatter):
    """Serialize log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401 - inherited docstring
        payload: MutableMapping[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        ctx: Optional[JsonLogContext] = getattr(record, "json_context", None)
        if ctx is not None:
            payload.update(ctx.to_dict())

        for field_name in ("job_id", "agent", "topic"):
            value = getattr(record, field_name, None)
            if value is not None:
                payload[field_name] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, sort_keys=True)


def configure_root_logger(level: int = logging.INFO) -> None:
    """Configure the global logging stack for JSON output."""

    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())

    logging.basicConfig(level=level, handlers=[handler], force=True)


def log_json(logger: logging.Logger, event: str, **details: Any) -> None:
    """Helper that attaches :class:`JsonLogContext` metadata."""

    logger.info("", extra={"json_context": JsonLogContext(event=event, details=details)})
