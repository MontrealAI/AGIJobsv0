from __future__ import annotations

import asyncio
import importlib
import sys

import prometheus_client
import pytest


@pytest.fixture(scope="module")
def onebox_module() -> object:
    patcher = pytest.MonkeyPatch()
    patcher.setenv("RPC_URL", "http://localhost:8545")
    patcher.setenv("CHAIN_ID", "31337")
    patcher.setattr(prometheus_client, "REGISTRY", prometheus_client.CollectorRegistry())
    sys.modules.pop("routes.onebox", None)
    module = importlib.import_module("routes.onebox")
    yield module
    patcher.undo()
    sys.modules.pop("routes.onebox", None)


class _DummyEth:
    def block_number(self) -> int:
        return 123456


class _FailingEth:
    def block_number(self) -> None:
        raise RuntimeError("rpc down")


def test_healthz_reports_success(onebox_module: object, monkeypatch: pytest.MonkeyPatch) -> None:
    module = onebox_module
    monkeypatch.setattr(module, "w3", type("DummyWeb3", (), {"eth": _DummyEth()})())
    result = asyncio.run(module.healthcheck())
    assert result == {"ok": True}


def test_healthz_surfaces_rpc_failure(onebox_module: object, monkeypatch: pytest.MonkeyPatch) -> None:
    module = onebox_module
    monkeypatch.setattr(module, "w3", type("FailingWeb3", (), {"eth": _FailingEth()})())

    with pytest.raises(module.HTTPException) as exc:
        asyncio.run(module.healthcheck())

    assert exc.value.status_code == 503
    assert exc.value.detail == {"code": "RPC_UNAVAILABLE", "message": "rpc down"}
