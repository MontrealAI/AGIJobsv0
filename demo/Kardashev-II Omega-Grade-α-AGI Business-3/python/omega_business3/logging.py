from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


@dataclass
class LogEvent:
    level: str
    message: str
    context: Mapping[str, Any]
    timestamp: str

    def to_json(self) -> str:
        payload = asdict(self)
        payload["timestamp"] = self.timestamp
        return json.dumps(payload, sort_keys=True)


class JsonLogHandler(logging.Handler):
    def __init__(self, log_path: Path) -> None:
        super().__init__()
        self.log_path = log_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def emit(self, record: logging.LogRecord) -> None:
        context = getattr(record, "context", {})
        event = LogEvent(
            level=record.levelname,
            message=record.getMessage(),
            context=context,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        with self.log_path.open('a', encoding='utf-8') as fh:
            fh.write(event.to_json() + os.linesep)


def create_logger(name: str, log_path: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    handler = JsonLogHandler(Path(log_path))
    logger.addHandler(handler)
    logger.propagate = False
    return logger


def log_structured(logger: logging.Logger, message: str, **context: Any) -> None:
    logger.info(message, extra={"context": context})
