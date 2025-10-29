"""Structured logging utilities."""
from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from typing import Any, Dict


def log(event: str, **details: Any) -> None:
    payload: Dict[str, Any] = {
        "timestamp": datetime.now(UTC).isoformat(),
        "event": event,
        **details,
    }
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()
