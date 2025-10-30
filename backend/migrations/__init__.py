"""Database migrations for backend services."""

from .hgm import MIGRATIONS as HGM_MIGRATIONS

MIGRATIONS = HGM_MIGRATIONS

__all__ = ["MIGRATIONS"]
