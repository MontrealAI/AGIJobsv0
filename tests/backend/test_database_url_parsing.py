from __future__ import annotations

import pytest

from pathlib import Path

from backend import database as db_module
from backend.database import DatabaseError, get_database, set_database


def test_parse_postgres_psycopg_url_requires_driver() -> None:
    if db_module.psycopg is not None:
        pytest.skip("psycopg installed; requirement test not applicable")
    with pytest.raises(DatabaseError, match="psycopg is required"):
        db_module.Database._parse_url("postgresql+psycopg://user@localhost/db")


def test_parse_postgres_psycopg_url_normalizes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db_module, "psycopg", object())
    driver, dsn = db_module.Database._parse_url("postgresql+psycopg://user@localhost/db")
    assert driver == "postgres"
    assert dsn == "postgresql://user@localhost/db"


def test_get_database_rejects_conflicting_urls(tmp_path: Path) -> None:
    set_database(None)
    first_url = f"sqlite:///{tmp_path / 'first.db'}"
    second_url = f"sqlite:///{tmp_path / 'second.db'}"
    try:
        get_database(first_url)
        with pytest.raises(DatabaseError, match="already initialised"):
            get_database(second_url)
    finally:
        set_database(None)
