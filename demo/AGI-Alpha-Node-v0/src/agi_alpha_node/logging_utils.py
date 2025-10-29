"""Structured logging utilities for the AGI Alpha Node demo."""

from __future__ import annotations

import json
import logging
import os
from logging import Logger
from typing import Any, Dict, Optional

from rich.console import Console
from rich.logging import RichHandler


def configure_logging(log_file: Optional[str] = None, *, level: int = logging.INFO) -> Logger:
    """Configure structured logging for the node.

    Args:
        log_file: Optional path to a JSON lines log file for audit trails.
        level: Logging level to apply to the root logger.

    Returns:
        Configured root logger instance.
    """

    console = Console(stderr=True)
    handler = RichHandler(console=console, show_time=False, show_path=False)
    formatter = logging.Formatter("%(message)s")
    handler.setFormatter(formatter)

    logger = logging.getLogger("agi_alpha_node")
    logger.setLevel(level)
    logger.handlers.clear()
    logger.addHandler(handler)

    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(StructuredJsonFormatter())
        logger.addHandler(file_handler)

    logger.debug("Structured logging initialised", extra={"component": "logging"})
    return logger


class StructuredJsonFormatter(logging.Formatter):
    """Formatter that emits JSON lines for long-term audit trails."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        base: Dict[str, Any] = {
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            base["exc_info"] = self.formatException(record.exc_info)
        if hasattr(record, "event"):
            base["event"] = getattr(record, "event")
        if hasattr(record, "data"):
            base["data"] = getattr(record, "data")
        return json.dumps(base)


__all__ = ["configure_logging", "StructuredJsonFormatter"]
