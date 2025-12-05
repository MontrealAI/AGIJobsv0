import json
import os
import sys
import pytest

os.environ.setdefault("RPC_URL", "http://localhost:8545")

# Remove any stubbed onebox module so OrgPolicyStore loads from the real router
# implementation during this test module's import.
sys.modules.pop("routes.onebox", None)

from routes.onebox import OrgPolicyStore


@pytest.fixture()
def temp_policy_file(tmp_path):
    policy_path = tmp_path / "policies.json"
    return policy_path


def test_load_applies_defaults_when_values_missing(temp_policy_file):
    temp_policy_file.write_text(json.dumps({"acme": {"maxBudgetWei": str(10**18)}}))

    store = OrgPolicyStore(
        policy_path=str(temp_policy_file),
        default_max_budget_wei=2 * 10**18,
        default_max_duration_days=7,
    )

    record = store._policies["acme"]
    assert record.max_budget_wei == 10**18
    assert record.max_duration_days == 7


def test_load_respects_overrides_from_file(temp_policy_file):
    temp_policy_file.write_text(
        json.dumps({"acme": {"maxBudgetWei": str(3 * 10**18), "maxDurationDays": 4}})
    )

    store = OrgPolicyStore(
        policy_path=str(temp_policy_file),
        default_max_budget_wei=2 * 10**18,
        default_max_duration_days=7,
    )

    record = store._policies["acme"]
    assert record.max_budget_wei == 3 * 10**18
    assert record.max_duration_days == 4


def test_load_with_missing_values_and_no_defaults(temp_policy_file):
    temp_policy_file.write_text(json.dumps({"acme": {}}))

    store = OrgPolicyStore(policy_path=str(temp_policy_file))

    record = store._policies["acme"]
    assert record.max_budget_wei is None
    assert record.max_duration_days is None


def test_load_without_file_uses_defaults(tmp_path):
    policy_path = tmp_path / "missing.json"

    store = OrgPolicyStore(
        policy_path=str(policy_path),
        default_max_budget_wei=5 * 10**17,
        default_max_duration_days=3,
    )

    record = store._policies["__default__"]
    assert record.max_budget_wei == 5 * 10**17
    assert record.max_duration_days == 3
