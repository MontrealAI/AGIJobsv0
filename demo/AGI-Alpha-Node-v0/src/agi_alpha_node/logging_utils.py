from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict

_LOG_FORMAT = "%(message)s"


def configure_logging(log_path: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(log_path, maxBytes=5_000_000, backupCount=3)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT))

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)


def json_log(event: str, **fields: Any) -> None:
    payload: Dict[str, Any] = {"event": event, **fields}
    logging.getLogger(__name__).info(json.dumps(payload, sort_keys=True))
