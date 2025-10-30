"""Pytest fixtures configuring an isolated HGM database."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Iterator

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("RPC_URL", "http://localhost:8545")
os.environ.setdefault("AGENT_REGISTRY_OWNER_TOKEN", "test-token")

from backend.database import Database, set_database
from backend.migrations import MIGRATIONS


@pytest.fixture(autouse=True)
def isolated_hgm_database(tmp_path) -> Iterator[None]:
    os.environ["HGM_DATABASE_URL"] = "sqlite:///:memory:"
    database = Database(os.environ["HGM_DATABASE_URL"])
    database.run_migrations(MIGRATIONS)
    set_database(database)
    try:
        yield
    finally:
        database.close()
        set_database(None)
