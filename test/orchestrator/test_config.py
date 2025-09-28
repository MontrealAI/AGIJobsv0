"""Unit tests for orchestrator.config helpers."""

from decimal import Decimal

import pytest

pytest.importorskip("pydantic")

from orchestrator import config


@pytest.fixture(autouse=True)
def _clear_caches(monkeypatch):
    monkeypatch.delenv("ONEBOX_DEFAULT_FEE_PCT", raising=False)
    monkeypatch.delenv("ONEBOX_FEE_PCT", raising=False)
    monkeypatch.delenv("ONEBOX_DEFAULT_BURN_PCT", raising=False)
    monkeypatch.delenv("ONEBOX_BURN_PCT", raising=False)
    config.get_fee_fraction.cache_clear()
    config.get_burn_fraction.cache_clear()
    yield
    config.get_fee_fraction.cache_clear()
    config.get_burn_fraction.cache_clear()


def test_fee_fraction_defaults_to_config():
    assert config.get_fee_fraction() == Decimal("0.0500")


def test_burn_fraction_defaults_to_config():
    assert config.get_burn_fraction() == Decimal("0.0200")


def test_environment_overrides(monkeypatch):
    monkeypatch.setenv("ONEBOX_DEFAULT_FEE_PCT", "3.5")
    monkeypatch.setenv("ONEBOX_DEFAULT_BURN_PCT", "1.25")
    config.get_fee_fraction.cache_clear()
    config.get_burn_fraction.cache_clear()
    assert config.get_fee_fraction() == Decimal("0.0350")
    assert config.get_burn_fraction() == Decimal("0.0125")


def test_format_percent():
    assert config.format_percent(Decimal("0.025")) == "2.5%"
    assert config.format_percent(Decimal("0.0500")) == "5%"
