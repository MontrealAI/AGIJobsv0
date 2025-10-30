from __future__ import annotations

import json
import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict


def configure_logging(log_dir: str, log_level: str = "INFO") -> None:
    """Configure structured logging with rotation.

    Parameters
    ----------
    log_dir:
        Directory where log files will be stored.
    log_level:
        Logging level name (case insensitive).
    """

    level = getattr(logging, log_level.upper(), logging.INFO)
    Path(log_dir).mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(os.path.join(log_dir, "agi_alpha_node.log"), maxBytes=5_000_000, backupCount=5)

    class JsonFormatter(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:  # noqa: D401 - inherited docstring
            payload: Dict[str, Any] = {
                "level": record.levelname,
                "message": record.getMessage(),
                "logger": record.name,
                "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            }
            if record.exc_info:
                payload["exc_info"] = self.formatException(record.exc_info)
            if record.__dict__.get("tx_hash"):
                payload["tx_hash"] = record.__dict__["tx_hash"]
            if record.__dict__.get("context"):
                payload["context"] = record.__dict__["context"]
            return json.dumps(payload)

    formatter = JsonFormatter()
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()
    root.addHandler(handler)

    console = logging.StreamHandler()
    console.setFormatter(formatter)
    root.addHandler(console)


__all__ = ["configure_logging"]
