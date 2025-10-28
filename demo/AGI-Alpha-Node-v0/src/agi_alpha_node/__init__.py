"""AGI Alpha Node demo package."""
from __future__ import annotations

from .config import Config, load_config


def app(argv: list[str] | None = None) -> int:
    from .cli import main

    return main(argv)


__all__ = ["Config", "load_config", "app"]
