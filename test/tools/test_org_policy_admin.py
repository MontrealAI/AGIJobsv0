import json
from decimal import Decimal
from pathlib import Path

import pytest

from tools import org_policy_admin as opa


def test_parse_budget_token_units() -> None:
    amount = opa.parse_budget("1.25", unit="token", decimals=18)
    assert amount == int(Decimal("1.25") * (10 ** 18))


def test_parse_budget_wei_units() -> None:
    assert opa.parse_budget("1000000000000000000", unit="wei", decimals=18) == 10 ** 18


def test_parse_budget_handles_none() -> None:
    assert opa.parse_budget(None, unit="token", decimals=18) is None
    assert opa.parse_budget("none", unit="token", decimals=18) is None


def test_command_set_requires_changes(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    policy_file = tmp_path / "policies.json"
    store = opa.PolicyStore(policy_file)
    result = opa.command_set(
        store,
        org="acme",
        max_budget=None,
        budget_unit="token",
        clear_max_budget=False,
        max_duration=None,
        clear_max_duration=False,
        allowed_tools=None,
        clear_tools=False,
        decimals=18,
    )
    assert result == 0
    captured = capsys.readouterr().out
    assert "No updates requested" in captured
    assert not policy_file.exists()


def test_command_set_creates_policy(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    policy_file = tmp_path / "policies.json"
    store = opa.PolicyStore(policy_file)
    result = opa.command_set(
        store,
        org="acme",
        max_budget="50",
        budget_unit="token",
        clear_max_budget=False,
        max_duration=21,
        clear_max_duration=False,
        allowed_tools="planner.search,runner.*",
        clear_tools=False,
        decimals=18,
    )
    assert result == 0
    captured = capsys.readouterr()
    assert "Updated policy for acme" in captured.out

    with policy_file.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    assert set(data.keys()) == {"__default__", "acme"}
    acme = data["acme"]
    assert acme["maxBudgetWei"] == str(opa.parse_budget("50", unit="token", decimals=18))
    assert acme["maxDurationDays"] == 21
    assert acme.get("allowedTools") == ["planner.search", "runner.*"]
    assert "updatedAt" in acme


def test_command_delete(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    policy_file = tmp_path / "policies.json"
    policy_file.write_text(
        json.dumps({"acme": {"maxBudgetWei": "1000", "maxDurationDays": 10}}, indent=2),
        encoding="utf-8",
    )
    store = opa.PolicyStore(policy_file)
    result = opa.command_delete(store, org="acme")
    assert result == 0
    captured = capsys.readouterr()
    assert "Deleted policy for acme" in captured.out
    with policy_file.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    assert set(data.keys()) == {"__default__"}


def test_command_list_output(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    policy_file = tmp_path / "policies.json"
    policy_file.write_text(
        json.dumps(
            {
                "__default__": {
                    "maxBudgetWei": str(10 ** 19),
                    "maxDurationDays": 14,
                    "allowedTools": ["*"]
                }
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    store = opa.PolicyStore(policy_file)
    result = opa.command_list(store, symbol="AGI", decimals=18)
    assert result == 0
    output = capsys.readouterr().out
    assert "__default__" in output
    assert "AGI" in output
    assert "14" in output
