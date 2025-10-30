"""HGM schema migrations."""

from .migration_0001_initial import Migration0001Initial

MIGRATIONS = [Migration0001Initial()]

__all__ = ["MIGRATIONS"]
