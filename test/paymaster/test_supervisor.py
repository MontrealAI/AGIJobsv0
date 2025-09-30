import asyncio
import json
from pathlib import Path
from typing import Any, Dict

import pytest

try:  # pragma: no cover - optional dependency
    import yaml
except Exception:  # pragma: no cover - fallback
    yaml = None  # type: ignore[assignment]

from paymaster.supervisor.service import PaymasterSupervisor
from paymaster.supervisor.signers import LocalDebugSigner


class StubBalanceFetcher:
    def __init__(self, balance: int) -> None:
        self.balance = balance

    async def __call__(self, _address: str) -> int:
        await asyncio.sleep(0)
        return self.balance

    def set_balance(self, value: int) -> None:
        self.balance = value


def _write_config(path: Path, overrides: Dict[str, Any] | None = None) -> None:
    base = {
        "chain_id": 11155111,
        "paymaster_address": "0x000000000000000000000000000000000000dead",
        "balance_threshold_wei": 5,
        "max_user_operation_gas": 1_000_000,
        "default_daily_cap_wei": 100,
        "reload_interval_seconds": 1,
        "whitelist": [
            {"target": "0x000000000000000000000000000000000000beef", "selectors": ["0x12345678"]}
        ],
    }
    if overrides:
        base.update(overrides)
    if yaml is not None:
        path.write_text(yaml.safe_dump(base))
    else:
        path.write_text(json.dumps(base))


def _sponsor_args(**kwargs: Any) -> Dict[str, Any]:
    user_operation = {
        "callData": "0x12345678deadbeef",
        "target": "0x000000000000000000000000000000000000beef",
        "callGasLimit": 100_000,
        "verificationGasLimit": 100_000,
        "preVerificationGas": 100_000,
    }
    user_operation.update(kwargs.pop("user_operation", {}))
    context = {"org": "engineering", "estimated_cost_wei": 60}
    context.update(kwargs.pop("context", {}))
    return {"user_operation": user_operation, "context": context}


def test_hot_reload_updates_org_caps(tmp_path: Path) -> None:
    config_path = tmp_path / "paymaster.yaml"
    _write_config(config_path)
    supervisor = PaymasterSupervisor(
        config_path=config_path,
        signer=LocalDebugSigner(b"debug"),
        balance_fetcher=StubBalanceFetcher(10),
    )

    args = _sponsor_args()
    asyncio.run(supervisor.sponsor(**args))

    with pytest.raises(PermissionError):
        asyncio.run(supervisor.sponsor(**_sponsor_args(context={"estimated_cost_wei": 50})))

    _write_config(config_path, {"default_daily_cap_wei": 500})
    asyncio.run(supervisor._reload())  # trigger reload manually in tests

    assert supervisor.config.default_daily_cap_wei == 500
    asyncio.run(supervisor.sponsor(**_sponsor_args(context={"estimated_cost_wei": 150})))


def test_balance_gating_rejects_when_threshold_not_met(tmp_path: Path) -> None:
    config_path = tmp_path / "paymaster.yaml"
    _write_config(config_path, {"balance_threshold_wei": 100})
    balance = StubBalanceFetcher(50)
    supervisor = PaymasterSupervisor(
        config_path=config_path,
        signer=LocalDebugSigner(b"debug"),
        balance_fetcher=balance,
    )

    with pytest.raises(PermissionError):
        asyncio.run(supervisor.sponsor(**_sponsor_args()))

    balance.set_balance(200)
    asyncio.run(supervisor.sponsor(**_sponsor_args()))


def test_method_whitelist_is_enforced(tmp_path: Path) -> None:
    config_path = tmp_path / "paymaster.yaml"
    _write_config(config_path)
    supervisor = PaymasterSupervisor(
        config_path=config_path,
        signer=LocalDebugSigner(b"debug"),
        balance_fetcher=StubBalanceFetcher(10),
    )

    with pytest.raises(PermissionError):
        asyncio.run(
            supervisor.sponsor(
                **_sponsor_args(
                    user_operation={
                        "callData": "0xdeadbeefdeadbeef",
                        "target": "0x000000000000000000000000000000000000beef",
                    }
                )
            )
        )

    asyncio.run(supervisor.sponsor(**_sponsor_args()))
