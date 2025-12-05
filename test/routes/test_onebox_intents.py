import asyncio
import json
import os
import sys
import types

import pytest

os.environ.setdefault("RPC_URL", "http://localhost:8545")

# Clear any onebox stub injected by earlier modules so this suite exercises the
# real router implementation.
sys.modules.pop("routes.onebox", None)

if "fastapi" not in sys.modules:
    fastapi = types.ModuleType("fastapi")

    class _APIRouter:
        def __init__(self, *args, **kwargs):
            self.exception_handlers = {}

        def post(self, *args, **kwargs):
            def _decorator(func):
                return func

            return _decorator

        def get(self, *args, **kwargs):
            def _decorator(func):
                return func

            return _decorator

        def add_exception_handler(self, exc_class, handler):
            self.exception_handlers[exc_class] = handler

    def _depends(func=None):
        return func

    def _header(default=None, **_kwargs):
        return default

    class _HTTPException(Exception):
        def __init__(self, status_code: int, detail=None):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    fastapi.APIRouter = _APIRouter  # type: ignore[attr-defined]
    fastapi.Depends = _depends  # type: ignore[attr-defined]
    fastapi.Header = _header  # type: ignore[attr-defined]
    fastapi.HTTPException = _HTTPException  # type: ignore[attr-defined]
    sys.modules["fastapi"] = fastapi

if "prometheus_client" not in sys.modules:
    prometheus = types.ModuleType("prometheus_client")

    class _Metric:
        def __init__(self, *args, **kwargs):
            pass

        def labels(self, *args, **kwargs):
            return self

        def inc(self, *args, **kwargs):
            return None

        def observe(self, *args, **kwargs):
            return None

    class _CollectorRegistry:
        def __init__(self, *args, **kwargs):
            pass

    def _generate_latest(*args, **kwargs):
        return b""

    prometheus.Counter = _Metric  # type: ignore[attr-defined]
    prometheus.Histogram = _Metric  # type: ignore[attr-defined]
    prometheus.CollectorRegistry = _CollectorRegistry  # type: ignore[attr-defined]
    prometheus.CONTENT_TYPE_LATEST = "text/plain"
    prometheus.generate_latest = _generate_latest  # type: ignore[attr-defined]
    sys.modules["prometheus_client"] = prometheus

if "web3" not in sys.modules:
    web3_module = types.ModuleType("web3")

    class _DummyFunction:
        def estimate_gas(self, *args, **kwargs):
            return 21000

        def build_transaction(self, params):
            tx = dict(params)
            tx.setdefault("gas", 21000)
            tx.setdefault("chainId", 0)
            return tx

    class _DummyContract:
        address = "0x0000000000000000000000000000000000000000"

        class _Functions:
            def postJob(self, *args, **kwargs):
                return _DummyFunction()

            def finalize(self, *args, **kwargs):
                return _DummyFunction()

        class _Events:
            class _JobCreated:
                def process_receipt(self, *args, **kwargs):
                    return []

            def JobCreated(self):
                return self._JobCreated()

        def encodeABI(self, *args, **kwargs):
            return "0x"

        @property
        def functions(self):
            return self._Functions()

        @property
        def events(self):
            return self._Events()

    class _DummyAccount:
        def __init__(self):
            self.address = "0x0000000000000000000000000000000000000000"

        def sign_transaction(self, tx):
            class _Signed:
                rawTransaction = b""

            return _Signed()

    class _DummyEth:
        chain_id = 0
        max_priority_fee = 1
        account = types.SimpleNamespace(from_key=lambda *args, **kwargs: _DummyAccount())

        def __init__(self):
            self._contract = _DummyContract()

        def contract(self, *args, **kwargs):
            return self._contract

        def get_transaction_count(self, *args, **kwargs):
            return 0

        def get_block(self, *args, **kwargs):
            return {}

        def send_raw_transaction(self, *args, **kwargs):
            return b""

        def wait_for_transaction_receipt(self, *args, **kwargs):
            return {}

    class _DummyMiddleware:
        def inject(self, *args, **kwargs):
            return None

    class Web3:
        class HTTPProvider:
            def __init__(self, *args, **kwargs):
                pass

        def __init__(self, *args, **kwargs):
            self.eth = _DummyEth()
            self.middleware_onion = _DummyMiddleware()

        @staticmethod
        def to_checksum_address(addr):
            return addr

        @staticmethod
        def to_wei(value, unit):
            return int(float(value))

    web3_module.Web3 = Web3
    sys.modules["web3"] = web3_module

    middleware_module = types.ModuleType("web3.middleware")

    def geth_poa_middleware(*args, **kwargs):
        return None

    middleware_module.geth_poa_middleware = geth_poa_middleware
    sys.modules["web3.middleware"] = middleware_module

    utils_module = types.ModuleType("web3._utils")
    events_module = types.ModuleType("web3._utils.events")

    def _get_event_data(*args, **kwargs):
        return {}

    events_module.get_event_data = _get_event_data
    utils_module.events = events_module
    sys.modules["web3._utils"] = utils_module
    sys.modules["web3._utils.events"] = events_module

if "httpx" not in sys.modules:
    class _DummyResponse:
        status_code = 200
        content = b""

        def json(self):
            return {}

    class _DummyAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            return _DummyResponse()

    httpx_module = types.SimpleNamespace(AsyncClient=_DummyAsyncClient)
    sys.modules["httpx"] = httpx_module

if "pydantic" not in sys.modules:
    _MISSING = object()

    class _FieldInfo:
        def __init__(self, default=_MISSING, default_factory=None, **kwargs):
            self.default = default
            self.default_factory = default_factory

    def Field(default=_MISSING, default_factory=None, **kwargs):
        return _FieldInfo(default=default, default_factory=default_factory)

    class BaseModel:
        def __init__(self, **data):
            annotations = getattr(self, "__annotations__", {})
            for name in annotations:
                default = getattr(self.__class__, name, _MISSING)
                if isinstance(default, _FieldInfo):
                    if default.default_factory is not None:
                        value = default.default_factory()
                    elif default.default is not _MISSING:
                        value = default.default
                    else:
                        value = None
                elif default is not _MISSING:
                    value = default
                else:
                    value = None
                object.__setattr__(self, name, value)
            for key, value in data.items():
                object.__setattr__(self, key, value)

        def dict(self, *args, **kwargs):
            annotations = getattr(self, "__annotations__", {})
            result = {}
            for name in annotations:
                value = getattr(self, name)
                if hasattr(value, "dict"):
                    value = value.dict(*args, **kwargs)
                elif isinstance(value, list):
                    value = [item.dict(*args, **kwargs) if hasattr(item, "dict") else item for item in value]
                result[name] = value
            return result

        def json(self, *args, **kwargs):
            return json.dumps(self.dict(*args, **kwargs))

    pydantic_module = types.SimpleNamespace(BaseModel=BaseModel, Field=Field)
    sys.modules["pydantic"] = pydantic_module

from routes.onebox import (
    JobIntent,
    Payload,
    PlanRequest,
    _summary_for_intent,
    _naive_parse,
    plan,
)


def _make_request(headers=None):
    return types.SimpleNamespace(headers=headers or {}, state=types.SimpleNamespace())


def test_naive_parse_finalize_detects_job_id():
    intent = _naive_parse("Finalize job 789 right away")
    assert intent.action == "finalize_job"
    assert intent.payload.jobId == 789


def test_naive_parse_status_detects_job_id():
    intent = _naive_parse("Need status for job 555")
    assert intent.action == "check_status"
    assert intent.payload.jobId == 555

def test_plan_summarizes_finalize_intent():
    response = asyncio.run(plan(_make_request(), PlanRequest(text="Finalize job 42")))
    assert response.intent.action == "finalize_job"
    assert response.intent.payload.jobId == 42
    assert "finalization request" in response.summary.lower()
    assert "finalize job #42" in response.summary.lower()


def test_plan_summarizes_status_intent():
    response = asyncio.run(plan(_make_request(), PlanRequest(text="Check status of job 101")))
    assert response.intent.action == "check_status"
    assert response.intent.payload.jobId == 101
    assert "status request" in response.summary.lower()
    assert "status of job 101" in response.summary.lower()


def test_plan_summarizes_post_job_intent():
    response = asyncio.run(plan(_make_request(), PlanRequest(text="Help me post a job")))
    assert response.intent.action == "post_job"
    assert "(not provided)" in response.summary
    assert "Missing reward and deadline details" in response.summary
    assert response.requiresConfirmation is False


def test_summary_applies_demo_defaults():
    intent = JobIntent(action="post_job", payload=Payload(), userContext={"mode": "demo"})
    summary, requires_confirmation, warnings = _summary_for_intent(
        intent, "Help me post a job"
    )
    assert requires_confirmation is True
    assert "1.0 AGIALPHA" in summary
    assert "7 day" in summary
    assert "Protocol fee" in summary
    assert "DEFAULT_REWARD_APPLIED" in warnings
    assert "DEFAULT_DEADLINE_APPLIED" in warnings
