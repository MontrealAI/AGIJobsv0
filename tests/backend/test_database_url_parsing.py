from __future__ import annotations

import pytest

from backend import database as db_module
from backend.database import DatabaseError


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
