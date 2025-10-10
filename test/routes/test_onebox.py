import asyncio
import copy
import json
import os
import sys
import tempfile
import types
import unittest
import threading
from typing import Any, Dict, Optional
from unittest import mock

os.environ.setdefault("RPC_URL", "http://localhost:8545")

_force_stub_fastapi = os.getenv("ONEBOX_TEST_FORCE_STUB_FASTAPI") == "1"
# ONEBOX_TEST_FORCE_STUB_WEB3 allows the suite to replace the real Web3 implementation
# with a minimal stub so unit tests do not require a live JSON-RPC endpoint.
_force_stub_web3 = os.getenv("ONEBOX_TEST_FORCE_STUB_WEB3") == "1"

try:
    if _force_stub_fastapi:
        raise ModuleNotFoundError
    import fastapi  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    fastapi = types.ModuleType("fastapi")

    class _DummyAPIRouter:  # pragma: no cover - testing shim
        def __init__(self, *args, **_kwargs):
            self.exception_handlers = {}

        def post(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            def _decorator(func):
                return func

            return _decorator

        def get(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            def _decorator(func):
                return func

            return _decorator

        def add_exception_handler(self, exc_class, handler):  # type: ignore[no-untyped-def]
            self.exception_handlers[exc_class] = handler

    def _depends(func=None):  # type: ignore[no-untyped-def]
        return func

    def _header(default=None, **_kwargs):  # type: ignore[no-untyped-def]
        return default

    class _HTTPException(Exception):
        def __init__(self, status_code: int, detail=None) -> None:
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class _Request:  # pragma: no cover - testing shim
        pass

    class _Response:  # pragma: no cover - testing shim
        def __init__(self, content=None, media_type=None, status_code: int = 200):
            self.body = content
            self.media_type = media_type
            self.status_code = status_code

    fastapi.APIRouter = _DummyAPIRouter  # type: ignore[attr-defined]
    fastapi.Depends = _depends  # type: ignore[attr-defined]
    fastapi.Header = _header  # type: ignore[attr-defined]
    fastapi.HTTPException = _HTTPException  # type: ignore[attr-defined]
    fastapi.Request = _Request  # type: ignore[attr-defined]
    fastapi.Response = _Response  # type: ignore[attr-defined]
    sys.modules["fastapi"] = fastapi

    responses_module = types.ModuleType("fastapi.responses")

    class _JSONResponse:  # pragma: no cover - testing shim
        def __init__(self, *, status_code: int, content):
            self.status_code = status_code
            self.content = content

    responses_module.JSONResponse = _JSONResponse  # type: ignore[attr-defined]
    sys.modules["fastapi.responses"] = responses_module
else:
    if not hasattr(fastapi.APIRouter, "add_exception_handler"):
        def _add_exception_handler(self, exc_class, handler):  # type: ignore[no-untyped-def]
            if not hasattr(self, "exception_handlers"):
                self.exception_handlers = {}  # type: ignore[attr-defined]
            self.exception_handlers[exc_class] = handler  # type: ignore[index]

        fastapi.APIRouter.add_exception_handler = _add_exception_handler  # type: ignore[attr-defined]

try:
    import prometheus_client  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    class _Metric:  # pragma: no cover - testing shim
        def __init__(self, *args, **_kwargs):
            pass

        def labels(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return self

        def inc(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return None

        def observe(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return None

    class _CollectorRegistry:  # pragma: no cover - testing shim
        def __init__(self, *args, **_kwargs):
            pass

    def _generate_latest(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        return b""

    prometheus_client = types.ModuleType("prometheus_client")
    prometheus_client.Counter = _Metric  # type: ignore[attr-defined]
    prometheus_client.Histogram = _Metric  # type: ignore[attr-defined]
    prometheus_client.CollectorRegistry = _CollectorRegistry  # type: ignore[attr-defined]
    prometheus_client.CONTENT_TYPE_LATEST = "text/plain"
    prometheus_client.generate_latest = _generate_latest  # type: ignore[attr-defined]
    sys.modules["prometheus_client"] = prometheus_client


def _make_request(headers=None):  # type: ignore[no-untyped-def]
    return types.SimpleNamespace(
        headers=headers or {},
        state=types.SimpleNamespace(),
    )



try:
    if _force_stub_web3:
        raise ModuleNotFoundError
    import web3  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    web3 = types.ModuleType("web3")

    class _DummyFunction:  # pragma: no cover - testing shim
        def estimate_gas(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return 21000

        def build_transaction(self, params):  # type: ignore[no-untyped-def]
            tx = dict(params)
            tx.setdefault("gas", 21000)
            tx.setdefault("chainId", 0)
            return tx

    class _DummyContract:  # pragma: no cover - testing shim
        address = "0x0000000000000000000000000000000000000000"

        class _Functions:
            def postJob(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
                return _DummyFunction()

            def finalize(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
                return _DummyFunction()

        class _Events:
            class _JobCreated:
                def process_receipt(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
                    return []

            def JobCreated(self):  # type: ignore[no-untyped-def]
                return self._JobCreated()

        def encodeABI(self, *args, **_kwargs):  # type: ignore[no-untyped-def]
            return "0x"

        @property
        def functions(self):  # type: ignore[no-untyped-def]
            return self._Functions()

        @property
        def events(self):  # type: ignore[no-untyped-def]
            return self._Events()

    class _DummyAccount:  # pragma: no cover - testing shim
        def __init__(self) -> None:
            self.address = "0x0000000000000000000000000000000000000000"

        def sign_transaction(self, tx):  # type: ignore[no-untyped-def]
            class _Signed:
                rawTransaction = b""

            return _Signed()

    class _DummyEth:  # pragma: no cover - testing shim
        chain_id = 0
        max_priority_fee = 1
        account = types.SimpleNamespace(from_key=lambda *_args, **_kwargs: _DummyAccount())

        def __init__(self) -> None:
            self._contract = _DummyContract()

        def contract(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return self._contract

        def get_transaction_count(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return 0

        def get_block(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return {}

        def send_raw_transaction(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return b""

        def wait_for_transaction_receipt(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return {}

    class _DummyMiddleware:  # pragma: no cover - testing shim
        def inject(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
            return None

    class Web3:  # type: ignore[no-redef]
        class HTTPProvider:  # pragma: no cover - testing shim
            def __init__(self, *_args, **_kwargs):
                pass

        def __init__(self, *_args, **_kwargs):
            self.eth = _DummyEth()
            self.middleware_onion = _DummyMiddleware()

        @staticmethod
        def to_checksum_address(addr):  # type: ignore[no-untyped-def]
            return addr

        @staticmethod
        def to_wei(value, unit):  # type: ignore[no-untyped-def]
            try:
                if isinstance(value, str) and unit == "gwei":
                    return int(value) * (10**9)
                return int(value)
            except Exception:
                return 0

    web3.Web3 = Web3  # type: ignore[attr-defined]
    sys.modules["web3"] = web3

    middleware_module = types.ModuleType("web3.middleware")

    def geth_poa_middleware(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        return None

    middleware_module.geth_poa_middleware = geth_poa_middleware  # type: ignore[attr-defined]
    sys.modules["web3.middleware"] = middleware_module

    utils_module = types.ModuleType("web3._utils")
    events_module = types.ModuleType("web3._utils.events")

    def _get_event_data(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        return {}

    events_module.get_event_data = _get_event_data  # type: ignore[attr-defined]
    utils_module.events = events_module  # type: ignore[attr-defined]
    sys.modules["web3._utils"] = utils_module
    sys.modules["web3._utils.events"] = events_module
else:
    middleware_module = sys.modules.get("web3.middleware") or types.ModuleType("web3.middleware")
    if not hasattr(middleware_module, "geth_poa_middleware"):
        def _noop_geth_poa_middleware(*_args, **_kwargs):  # type: ignore[no-untyped-def]
            return None

        middleware_module.geth_poa_middleware = _noop_geth_poa_middleware  # type: ignore[attr-defined]
        sys.modules["web3.middleware"] = middleware_module

try:
    import httpx  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    class _DummyResponse:
        status_code = 200
        content = b""

        def json(self) -> dict:
            return {}

    class _DummyAsyncClient:  # pragma: no cover - testing shim
        def __init__(self, *args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def post(self, *_args, **_kwargs):
            return _DummyResponse()

    httpx_module = types.SimpleNamespace(AsyncClient=_DummyAsyncClient)
    sys.modules["httpx"] = httpx_module

try:
    from pydantic import BaseModel, Field  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    _MISSING = object()

    class _FieldInfo:
        def __init__(self, default=_MISSING, default_factory=None, **_kwargs):
            self.default = default
            self.default_factory = default_factory

    def Field(default=_MISSING, default_factory=None, **_kwargs):  # type: ignore[no-redef]
        return _FieldInfo(default=default, default_factory=default_factory)

    class BaseModel:  # type: ignore[no-redef]
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

        def dict(self, *args, **_kwargs):  # type: ignore[no-untyped-def]
            annotations = getattr(self, "__annotations__", {})
            result = {}
            for name in annotations:
                value = getattr(self, name)
                if hasattr(value, "dict"):
                    value = value.dict(*args, **_kwargs)
                elif isinstance(value, list):
                    value = [item.dict(*args, **_kwargs) if hasattr(item, "dict") else item for item in value]
                result[name] = value
            return result

        def json(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            return json.dumps(self.dict(*args, **kwargs))

    sys.modules["pydantic"] = types.SimpleNamespace(BaseModel=BaseModel, Field=Field)

import prometheus_client  # type: ignore  # noqa: E402  pylint: disable=wrong-import-position
import routes.onebox as onebox  # noqa: E402  pylint: disable=wrong-import-position

from orchestrator.aa import (  # noqa: E402  pylint: disable=wrong-import-position
    AABundlerError,
    AAPaymasterRejection,
    AAPolicyRejection,
    AccountAbstractionResult,
)
from routes.onebox import (  # noqa: E402  pylint: disable=wrong-import-position
    ExecuteRequest,
    SimulateRequest,
    SimulateResponse,
    health_router,
    JobIntent,
    OrgPolicyStore,
    OrgPolicyViolation,
    Payload,
    PlanRequest,
    router,
    Web3,
    _calculate_deadline_timestamp,
    _compute_plan_hash,
    _summary_for_intent,
    _error_detail,
    _error_message,
    _ERRORS,
    _ERROR_CATALOG_PATH,
    _decode_job_created,
    _parse_default_max_budget,
    _parse_default_max_duration,
    _read_status,
    _UINT64_MAX,
    _current_timestamp,
    _detect_missing_fields,
    _maybe_model_dump,
    _store_plan_metadata,
    StatusResponse,
    execute,
    healthcheck,
    metrics_endpoint,
    plan,
    simulate,
)


def _register_plan(intent: JobIntent) -> str:
    plan_hash = _compute_plan_hash(intent)
    snapshot = _maybe_model_dump(intent)
    snapshot_dict = snapshot if isinstance(snapshot, dict) else None
    missing = _detect_missing_fields(intent)
    _store_plan_metadata(
        plan_hash,
        _current_timestamp(),
        intent_snapshot=snapshot_dict,
        missing_fields=missing,
    )
    return plan_hash


def _encode_metadata(state: int, deadline: int = 0, assigned_at: int = 0) -> int:
    state_bits = int(state) & 0x7
    deadline_bits = (int(deadline) & ((1 << 64) - 1)) << 77
    assigned_bits = (int(assigned_at) & ((1 << 64) - 1)) << 141
    return state_bits | deadline_bits | assigned_bits


class ErrorCatalogTests(unittest.TestCase):
    def test_error_catalog_matches_json_source(self) -> None:
        with open(_ERROR_CATALOG_PATH, "r", encoding="utf-8") as handle:
            catalog = json.load(handle)

        self.assertEqual(catalog, _ERRORS)

    def test_error_detail_matches_catalog(self) -> None:
        for code, entry in _ERRORS.items():
            detail = _error_detail(code)
            self.assertEqual(detail["code"], code)
            self.assertEqual(detail["message"], entry["message"])
            hint = entry.get("hint")
            if hint:
                self.assertEqual(detail.get("hint"), hint)
            else:
                self.assertNotIn("hint", detail)


class PlannerIntentTests(unittest.IsolatedAsyncioTestCase):
    async def test_finalize_keyword_routes_to_finalize_action(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Please finalize job 321"))
        self.assertEqual(response.intent.action, "finalize_job")
        self.assertEqual(response.intent.payload.jobId, 321)
        self.assertIn("finalization request", response.summary.lower())
        self.assertIn("job #321", response.summary.lower())

    async def test_status_keyword_routes_to_status_action(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Can you check status of job 654?"))
        self.assertEqual(response.intent.action, "check_status")
        self.assertEqual(response.intent.payload.jobId, 654)
        self.assertIn("status request", response.summary.lower())
        self.assertIn("job 654", response.summary.lower())

    async def test_status_intent_infers_job_id(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Status of job 456"))
        self.assertEqual(response.intent.action, "check_status")
        self.assertEqual(response.intent.payload.jobId, 456)
        self.assertIn("detected job status request", response.summary.lower())
        self.assertIn("status of job 456", response.summary.lower())

    async def test_finalize_intent_infers_job_id(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Finalize job 123"))
        self.assertEqual(response.intent.action, "finalize_job")
        self.assertEqual(response.intent.payload.jobId, 123)
        self.assertIn("detected job finalization request", response.summary.lower())
        self.assertIn("finalize job #123", response.summary.lower())

    async def test_state_keyword_maps_to_status_intent(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="What's the state of job 890?"))
        self.assertEqual(response.intent.action, "check_status")
        self.assertEqual(response.intent.payload.jobId, 890)
        self.assertIn("detected job status request", response.summary.lower())

    async def test_complete_keyword_maps_to_finalize_intent(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Can you complete job 42 now?"))
        self.assertEqual(response.intent.action, "finalize_job")
        self.assertEqual(response.intent.payload.jobId, 42)
        self.assertIn("detected job finalization request", response.summary.lower())

    async def test_stake_keyword_maps_to_stake_intent(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Stake on job 555"))
        self.assertEqual(response.intent.action, "stake")
        self.assertEqual(response.intent.payload.jobId, 555)
        self.assertIn("detected staking request", response.summary.lower())
        self.assertIn("stake on job 555", response.summary.lower())

    async def test_validate_keyword_maps_to_validate_intent(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Please validate job 777"))
        self.assertEqual(response.intent.action, "validate")
        self.assertEqual(response.intent.payload.jobId, 777)
        self.assertIn("detected validation request", response.summary.lower())
        self.assertIn("validate job 777", response.summary.lower())

    async def test_dispute_keyword_maps_to_dispute_intent(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Dispute job 888 immediately"))
        self.assertEqual(response.intent.action, "dispute")
        self.assertEqual(response.intent.payload.jobId, 888)
        self.assertIn("detected dispute request", response.summary.lower())
        self.assertIn("dispute job 888", response.summary.lower())

    async def test_mistake_does_not_trigger_stake_intent(self) -> None:
        response = await plan(
            _make_request(),
            PlanRequest(text="That was a mistake on my part, let's prepare a new posting."),
        )
        self.assertEqual(response.intent.action, "post_job")

    async def test_validate_without_job_context_defaults_to_post_job(self) -> None:
        response = await plan(
            _make_request(),
            PlanRequest(text="We should validate the output thoroughly before sharing."),
        )
        self.assertEqual(response.intent.action, "post_job")

    async def test_post_job_summary_highlights_missing_details_outside_demo(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Please help me post a job"))
        self.assertEqual(response.intent.action, "post_job")
        self.assertIn("(not provided)", response.summary)
        self.assertIn("Missing reward and deadline details", response.summary)
        self.assertIsNone(response.intent.payload.reward)
        self.assertIsNone(response.intent.payload.deadlineDays)
        self.assertFalse(response.requiresConfirmation)
        self.assertCountEqual(response.missingFields, ["reward", "deadlineDays"])

    async def test_demo_mode_summary_applies_default_values(self) -> None:
        intent = JobIntent(action="post_job", payload=Payload(), userContext={"demoMode": True})
        summary, requires_confirmation, warnings = _summary_for_intent(
            intent, "Please help me post a job"
        )
        self.assertTrue(requires_confirmation)
        self.assertIn("1.0 AGIALPHA", summary)
        self.assertIn("7 day", summary)
        self.assertIn("Protocol fee", summary)
        self.assertIn("DEFAULT_REWARD_APPLIED", warnings)
        self.assertIn("DEFAULT_DEADLINE_APPLIED", warnings)

    async def test_demo_mode_detected_from_mode_string(self) -> None:
        intent = JobIntent(action="post_job", payload=Payload(), userContext={"mode": "demo"})
        summary, _requires_confirmation, warnings = _summary_for_intent(
            intent, "Post job"
        )
        self.assertIn("1.0 AGIALPHA", summary)
        self.assertIn("DEFAULT_REWARD_APPLIED", warnings)

    async def test_post_job_summary_includes_agent_types(self) -> None:
        intent = JobIntent(
            action="post_job",
            payload=Payload(reward="2", deadlineDays=10, agentTypes=["coder"]),
        )
        summary, requires_confirmation, warnings = _summary_for_intent(
            intent, "Please help me post a job"
        )
        self.assertTrue(requires_confirmation)
        self.assertEqual(warnings, [])
        self.assertIn("Agents coder", summary)


class PlannerValidationTests(unittest.IsolatedAsyncioTestCase):
    async def test_plan_rejects_empty_request(self) -> None:
        with self.assertRaises(fastapi.HTTPException) as exc:
            await plan(_make_request(), PlanRequest(text="   "))
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "REQUEST_EMPTY")

    async def test_plan_marks_finalize_without_job_id(self) -> None:
        response = await plan(_make_request(), PlanRequest(text="Finalize the job please"))
        self.assertEqual(response.intent.action, "finalize_job")
        self.assertIn("jobId", response.missingFields)
        self.assertFalse(response.requiresConfirmation)

    async def test_plan_ignores_numbers_without_job_identifier(self) -> None:
        response = await plan(
            _make_request(), PlanRequest(text="Finalize the job in 2 days")
        )
        self.assertEqual(response.intent.action, "finalize_job")
        self.assertIsNone(response.intent.payload.jobId)
        self.assertIn("jobId", response.missingFields)
        self.assertFalse(response.requiresConfirmation)


class SimulatorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._registry_patcher = mock.patch.object(
            onebox.registry,
            "functions",
            new=mock.MagicMock(),
        )
        self._registry_functions = self._registry_patcher.start()
        onebox._STATUS_CACHE.clear()

    async def asyncTearDown(self) -> None:
        try:
            self.assertEqual(self._registry_functions.mock_calls, [])
        finally:
            self._registry_patcher.stop()

    async def test_simulate_post_job_success(self) -> None:
        intent = JobIntent(action="post_job", payload=Payload(title="Label data", reward="5", deadlineDays=7))
        plan_hash = _register_plan(intent)
        response = await simulate(
            _make_request(),
            SimulateRequest(intent=intent, planHash=plan_hash),
        )
        self.assertIsInstance(response, SimulateResponse)
        self.assertEqual(response.intent.payload.reward, "5")
        self.assertEqual(response.blockers, [])
        self.assertTrue(response.planHash.startswith("0x"))
        self.assertIsNotNone(response.createdAt)
        self.assertEqual(response.estimatedBudget, "5.15")
        self.assertEqual(response.feePct, 2.0)
        self.assertEqual(response.feeAmount, "0.1")
        self.assertEqual(response.burnPct, 1.0)
        self.assertEqual(response.burnAmount, "0.05")

    async def test_simulate_rejects_missing_plan_hash(self) -> None:
        intent = JobIntent(action="post_job", payload=Payload(title="Label data", reward="5", deadlineDays=7))
        with self.assertRaises(fastapi.HTTPException) as exc:
            await simulate(_make_request(), SimulateRequest(intent=intent))
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_REQUIRED")
        self.assertEqual(
            exc.exception.detail["message"], _ERRORS["PLAN_HASH_REQUIRED"]["message"]
        )

    async def test_simulate_rejects_blank_plan_hash(self) -> None:
        intent = JobIntent(action="post_job", payload=Payload(title="Label data", reward="5", deadlineDays=7))
        with self.assertRaises(fastapi.HTTPException) as exc:
            await simulate(
                _make_request(),
                SimulateRequest(intent=intent, planHash="   "),
            )
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_REQUIRED")

    async def test_simulate_rejects_invalid_plan_hash(self) -> None:
        intent = JobIntent(action="post_job", payload=Payload(title="Label data", reward="5", deadlineDays=7))
        with self.assertRaises(fastapi.HTTPException) as exc:
            await simulate(
                _make_request(),
                SimulateRequest(intent=intent, planHash="0x1234"),
            )
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_INVALID")

    async def test_simulate_rejects_unknown_plan_hash(self) -> None:
        intent = JobIntent(action="post_job", payload=Payload(title="Label data", reward="5", deadlineDays=7))
        canonical = _compute_plan_hash(intent)
        mismatch = "1" * 64
        if mismatch == canonical:
            mismatch = "2" * 64
        with self.assertRaises(fastapi.HTTPException) as exc:
            await simulate(
                _make_request(),
                SimulateRequest(intent=intent, planHash=mismatch),
            )
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_UNKNOWN")

    async def test_simulate_rejects_unapproved_intent_changes(self) -> None:
        original_intent = JobIntent(
            action="post_job",
            payload=Payload(title="Label data", reward="5", deadlineDays=7),
        )
        plan_hash = _register_plan(original_intent)
        mutated_intent = copy.deepcopy(original_intent)
        mutated_intent.action = "finalize_job"
        mutated_intent.payload.jobId = 123

        with self.assertRaises(fastapi.HTTPException) as exc:
            await simulate(
                _make_request(),
                SimulateRequest(intent=mutated_intent, planHash=plan_hash),
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_MISMATCH")

    async def test_simulate_post_job_missing_reward_returns_blocker(self) -> None:
        intent = JobIntent(action="post_job", payload=Payload(title="Label data", deadlineDays=7))
        plan_hash = _register_plan(intent)
        with self.assertRaises(fastapi.HTTPException) as exc:
            await simulate(
                _make_request(),
                SimulateRequest(intent=intent, planHash=plan_hash),
            )
        self.assertEqual(exc.exception.status_code, 422)
        detail = exc.exception.detail
        self.assertIn("INSUFFICIENT_BALANCE", detail["blockers"])  # type: ignore[index]

    async def test_simulate_flags_long_deadline_as_risk(self) -> None:
        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Map terrain", reward="5", deadlineDays=60),
        )
        plan_hash = _register_plan(intent)
        response = await simulate(
            _make_request(),
            SimulateRequest(intent=intent, planHash=plan_hash),
        )
        self.assertEqual(response.blockers, [])
        self.assertIn("LONG_DEADLINE", response.riskCodes)
        self.assertIn(_error_message("LONG_DEADLINE"), response.risks)
        self.assertTrue(
            any(detail["code"] == "LONG_DEADLINE" for detail in response.riskDetails)
        )

    async def test_simulate_policy_violation_returns_blocker(self) -> None:
        intent = JobIntent(action="post_job", payload=Payload(title="Label data", reward="25", deadlineDays=7))
        violation = OrgPolicyViolation(
            "JOB_BUDGET_CAP_EXCEEDED",
            "Too high",
            types.SimpleNamespace(max_budget_wei=None, max_duration_days=None),
        )

        class _PolicyStore:
            def enforce(self, *_args, **_kwargs):  # type: ignore[no-untyped-def]
                raise violation

        plan_hash = _register_plan(intent)
        with mock.patch("routes.onebox._get_org_policy_store", return_value=_PolicyStore()):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await simulate(
                    _make_request(),
                    SimulateRequest(intent=intent, planHash=plan_hash),
                )

        self.assertEqual(exc.exception.status_code, 422)
        detail = exc.exception.detail
        self.assertIn("JOB_BUDGET_CAP_EXCEEDED", detail["blockers"])  # type: ignore[index]
        self.assertEqual(detail["estimatedBudget"], "25.75")  # type: ignore[index]
        self.assertEqual(detail["feePct"], 2.0)  # type: ignore[index]
        self.assertEqual(detail["feeAmount"], "0.5")  # type: ignore[index]
        self.assertEqual(detail["burnPct"], 1.0)  # type: ignore[index]
        self.assertEqual(detail["burnAmount"], "0.25")  # type: ignore[index]

    async def test_simulate_rejects_runner_unsupported_actions(self) -> None:
        intent = JobIntent(action="stake", payload=Payload(jobId=123))
        plan_hash = _register_plan(intent)

        with self.assertRaises(fastapi.HTTPException) as exc:
            await simulate(
                _make_request(),
                SimulateRequest(intent=intent, planHash=plan_hash),
            )

        self.assertEqual(exc.exception.status_code, 422)
        detail = exc.exception.detail
        self.assertIn("UNSUPPORTED_ACTION", detail["blockers"])  # type: ignore[index]

    async def test_simulate_finalize_blocks_when_already_finalized(self) -> None:
        intent = JobIntent(action="finalize_job", payload=Payload(jobId=55))
        plan_hash = _register_plan(intent)
        status = StatusResponse(jobId=55, state="finalized")

        with mock.patch("routes.onebox._get_cached_status", return_value=status):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await simulate(
                    _make_request(),
                    SimulateRequest(intent=intent, planHash=plan_hash),
                )

        self.assertEqual(exc.exception.status_code, 422)
        detail = exc.exception.detail
        self.assertIn("JOB_ALREADY_FINALIZED", detail["blockers"])  # type: ignore[index]

    async def test_simulate_finalize_flags_unknown_status(self) -> None:
        intent = JobIntent(action="finalize_job", payload=Payload(jobId=77))
        plan_hash = _register_plan(intent)
        status = StatusResponse(jobId=77, state="unknown")

        with mock.patch("routes.onebox._get_cached_status", return_value=status), mock.patch(
            "routes.onebox._read_status", new=mock.AsyncMock(return_value=status)
        ):
            response = await simulate(
                _make_request(),
                SimulateRequest(intent=intent, planHash=plan_hash),
            )

        self.assertEqual(response.blockers, [])
        self.assertIn("STATUS_UNKNOWN", response.riskCodes)
        self.assertIn(_error_message("STATUS_UNKNOWN"), response.risks)

    async def test_simulate_finalize_blocks_when_job_not_ready(self) -> None:
        intent = JobIntent(action="finalize_job", payload=Payload(jobId=88))
        plan_hash = _register_plan(intent)
        status = StatusResponse(jobId=88, state="open")

        with mock.patch("routes.onebox._get_cached_status", return_value=status):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await simulate(
                    _make_request(),
                    SimulateRequest(intent=intent, planHash=plan_hash),
                )

        self.assertEqual(exc.exception.status_code, 422)
        detail = exc.exception.detail
        self.assertIn("JOB_NOT_READY_FOR_FINALIZE", detail["blockers"])  # type: ignore[index]

    async def test_simulate_finalize_fetches_status_when_cache_empty(self) -> None:
        intent = JobIntent(action="finalize_job", payload=Payload(jobId=91))
        plan_hash = _register_plan(intent)
        fetched_status = StatusResponse(jobId=91, state="assigned")

        with mock.patch("routes.onebox._get_cached_status", return_value=None), mock.patch(
            "routes.onebox._read_status", new=mock.AsyncMock(return_value=fetched_status)
        ):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await simulate(
                    _make_request(),
                    SimulateRequest(intent=intent, planHash=plan_hash),
                )

        self.assertEqual(exc.exception.status_code, 422)
        detail = exc.exception.detail
        self.assertIn("JOB_NOT_READY_FOR_FINALIZE", detail["blockers"])  # type: ignore[index]

    async def test_simulate_success_includes_receipt_metadata(self) -> None:
        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Collect datasets", reward="10", deadlineDays=5),
        )
        plan_hash = _register_plan(intent)

        response = await simulate(
            _make_request(), SimulateRequest(intent=intent, planHash=plan_hash)
        )

        self.assertEqual(response.blockers, [])
        self.assertIsNotNone(response.receipt)
        assert response.receipt is not None
        self.assertEqual(response.receipt.get("planHash"), response.planHash)
        self.assertEqual(response.receipt.get("summary"), response.summary)
        self.assertEqual(response.receipt.get("risks"), response.risks)
        digest = response.receipt.get("receiptDigest")
        self.assertIsInstance(digest, str)
        self.assertTrue(digest.startswith("0x"))
        self.assertEqual(digest, response.receiptDigest)
        self.assertGreater(len(digest), 10)


class PlanHashUpgradeTests(unittest.IsolatedAsyncioTestCase):
    async def test_plan_missing_reward_then_supply_before_simulate_and_execute(self) -> None:
        plan_response = await plan(
            _make_request(), PlanRequest(text="Please help me post a job for 5 days")
        )
        self.assertEqual(plan_response.intent.action, "post_job")
        self.assertIn("reward", plan_response.missingFields)
        original_hash = plan_response.planHash

        updated_intent = copy.deepcopy(plan_response.intent)
        updated_intent.payload.reward = "10"

        simulate_response = await simulate(
            _make_request(), SimulateRequest(intent=updated_intent, planHash=original_hash)
        )
        self.assertEqual(simulate_response.blockers, [])
        self.assertNotEqual(simulate_response.planHash, original_hash)
        self.assertEqual(simulate_response.planHash, _compute_plan_hash(updated_intent))

        async def _fake_pin_json(metadata, file_name="payload.json"):
            return {
                "cid": "bafyplanupgrade",
                "uri": "ipfs://bafyplanupgrade",
                "gatewayUrl": "https://ipfs.io/ipfs/bafyplanupgrade",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafyplanupgrade"],
            }

        execute_request = ExecuteRequest(
            intent=updated_intent,
            mode="wallet",
            planHash=simulate_response.planHash,
            createdAt=simulate_response.createdAt,
        )
        with mock.patch("routes.onebox._pin_json", side_effect=_fake_pin_json), mock.patch(
            "routes.onebox._compute_spec_hash", return_value=b"spec"
        ), mock.patch("routes.onebox.time.time", return_value=1_234_567):
            execute_response = await execute(_make_request(), execute_request)

        self.assertTrue(execute_response.ok)
        self.assertEqual(execute_response.planHash, simulate_response.planHash)
        self.assertEqual(execute_response.createdAt, simulate_response.createdAt)


class DeadlineComputationTests(unittest.TestCase):
    def test_calculate_deadline_uses_epoch_seconds(self) -> None:
        with mock.patch("routes.onebox.time.time", return_value=1_000_000):
            deadline = _calculate_deadline_timestamp(2)
        self.assertEqual(deadline, 1_000_000 + 2 * 86400)


class OwnerCapParsingTests(unittest.TestCase):
    def test_parse_default_max_budget_from_owner_env(self) -> None:
        with mock.patch.dict(os.environ, {"ORG_MAX_BUDGET_WEI": "12345"}, clear=True):
            self.assertEqual(_parse_default_max_budget(), 12345)

    def test_parse_default_max_budget_zero_disables_cap(self) -> None:
        with mock.patch.dict(os.environ, {"ORG_MAX_BUDGET_WEI": "0"}, clear=True):
            self.assertIsNone(_parse_default_max_budget())

    def test_parse_default_max_budget_invalid_owner_value(self) -> None:
        with mock.patch.dict(os.environ, {"ORG_MAX_BUDGET_WEI": "not-a-number"}, clear=True):
            self.assertIsNone(_parse_default_max_budget())

    def test_parse_default_max_duration_from_owner_env(self) -> None:
        with mock.patch.dict(os.environ, {"ORG_MAX_DEADLINE_DAYS": "21"}, clear=True):
            self.assertEqual(_parse_default_max_duration(), 21)

    def test_parse_default_max_duration_zero_disables_cap(self) -> None:
        with mock.patch.dict(os.environ, {"ORG_MAX_DEADLINE_DAYS": "0"}, clear=True):
            self.assertIsNone(_parse_default_max_duration())

    def test_parse_default_max_duration_invalid_owner_value(self) -> None:
        with mock.patch.dict(os.environ, {"ORG_MAX_DEADLINE_DAYS": "oops"}, clear=True):
            self.assertIsNone(_parse_default_max_duration())


class ExecutorPlanHashValidationTests(unittest.IsolatedAsyncioTestCase):
    async def test_execute_rejects_missing_plan_hash(self) -> None:
        intent = JobIntent(action="check_status", payload=Payload(jobId=123))
        with self.assertRaises(fastapi.HTTPException) as exc:
            await execute(_make_request(), ExecuteRequest(intent=intent))
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_REQUIRED")
        self.assertEqual(
            exc.exception.detail["message"], _ERRORS["PLAN_HASH_REQUIRED"]["message"]
        )

    async def test_execute_rejects_blank_plan_hash(self) -> None:
        intent = JobIntent(action="check_status", payload=Payload(jobId=123))
        with self.assertRaises(fastapi.HTTPException) as exc:
            await execute(
                _make_request(),
                ExecuteRequest(intent=intent, planHash=""),
            )
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_REQUIRED")

    async def test_execute_rejects_invalid_plan_hash(self) -> None:
        intent = JobIntent(action="check_status", payload=Payload(jobId=123))
        with self.assertRaises(fastapi.HTTPException) as exc:
            await execute(
                _make_request(),
                ExecuteRequest(intent=intent, planHash="0x1234"),
            )
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_INVALID")

    async def test_execute_rejects_unknown_plan_hash(self) -> None:
        intent = JobIntent(action="check_status", payload=Payload(jobId=123))
        canonical = _compute_plan_hash(intent)
        mismatch = "a" * 64
        if mismatch == canonical:
            mismatch = "b" * 64
        with self.assertRaises(fastapi.HTTPException) as exc:
            await execute(
                _make_request(),
                ExecuteRequest(intent=intent, planHash=mismatch),
            )
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_UNKNOWN")

    async def test_execute_rejects_unapproved_intent_changes(self) -> None:
        original_intent = JobIntent(action="check_status", payload=Payload(jobId=123))
        plan_hash = _register_plan(original_intent)
        mutated_intent = copy.deepcopy(original_intent)
        mutated_intent.action = "finalize_job"
        mutated_intent.payload.jobId = 123

        with self.assertRaises(fastapi.HTTPException) as exc:
            await execute(
                _make_request(),
                ExecuteRequest(intent=mutated_intent, planHash=plan_hash),
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail["code"], "PLAN_HASH_MISMATCH")


class ExecutorRewardValidationTests(unittest.IsolatedAsyncioTestCase):
    async def test_execute_rejects_non_numeric_reward(self) -> None:
        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Invalid", reward="not-a-number", deadlineDays=1),
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, mode="wallet", planHash=plan_hash)

        with self.assertRaises(fastapi.HTTPException) as exc:
            await execute(_make_request(), execute_request)

        self.assertEqual(exc.exception.status_code, 400)
        self.assertIsInstance(exc.exception.detail, dict)
        self.assertEqual(exc.exception.detail.get("code"), "REWARD_INVALID")


class ExecuteEndpointRegressionTests(unittest.TestCase):
    @unittest.skipUnless(hasattr(fastapi, "FastAPI"), "FastAPI application not available")
    def test_execute_endpoint_returns_reward_invalid_for_bad_reward(self) -> None:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Invalid", reward="not-a-number", deadlineDays=1),
        )
        plan_hash = _register_plan(intent)
        app = FastAPI()
        app.include_router(router)

        intent_payload = intent.dict() if hasattr(intent, "dict") else intent.model_dump()
        with mock.patch("routes.onebox._API_TOKEN", ""):
            response = TestClient(app).post(
                "/onebox/execute",
                json={
                    "intent": intent_payload,
                    "planHash": plan_hash,
                    "mode": "wallet",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {
                "detail": {
                    "code": "REWARD_INVALID",
                    "message": _ERRORS["REWARD_INVALID"]["message"],
                }
            },
        )


class ExecutorDeadlineTests(unittest.IsolatedAsyncioTestCase):
    async def test_execute_wallet_with_deadline_days_succeeds(self) -> None:
        captured_metadata = {}

        async def _fake_pin_json(metadata, file_name="payload.json"):
            captured_metadata.update(metadata)
            return {
                "cid": "bafkdeadline",
                "uri": "ipfs://bafkdeadline",
                "gatewayUrl": "https://ipfs.io/ipfs/bafkdeadline",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafkdeadline"],
                "provider": "test",
                "status": "pinned",
                "requestId": file_name,
                "size": None,
                "pinnedAt": None,
                "attempts": 1,
            }

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Example", reward="1", deadlineDays=3),
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, mode="wallet", planHash=plan_hash)
        request_ctx = _make_request()
        with mock.patch("routes.onebox._pin_json", side_effect=_fake_pin_json), mock.patch(
            "routes.onebox.time.time", return_value=2_000_000
        ), mock.patch("routes.onebox._compute_spec_hash", return_value=b"spec"):
            response = await execute(request_ctx, execute_request)

        self.assertTrue(response.ok)
        self.assertIn("deadline", captured_metadata)
        self.assertEqual(captured_metadata["deadline"], 2_000_000 + 3 * 86400)

    async def test_execute_wallet_propagates_agent_types_list(self) -> None:
        captured_metadata = {}

        async def _fake_pin_json(metadata, file_name="payload.json"):
            captured_metadata.update(metadata)
            return {
                "cid": "bafkagenttypes",
                "uri": "ipfs://bafkagenttypes",
                "gatewayUrl": "https://ipfs.io/ipfs/bafkagenttypes",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafkagenttypes"],
            }

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Example", reward="1", deadlineDays=3, agentTypes=["coder"]),
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, mode="wallet", planHash=plan_hash)
        request_ctx = _make_request()
        with mock.patch("routes.onebox._pin_json", side_effect=_fake_pin_json), mock.patch(
            "routes.onebox.time.time", return_value=2_000_000
        ), mock.patch("routes.onebox._compute_spec_hash", return_value=b"spec"):
            response = await execute(request_ctx, execute_request)

        self.assertTrue(response.ok)
        self.assertEqual(captured_metadata.get("agentTypes"), ["coder"])

    async def test_execute_rejects_deadline_overflow(self) -> None:
        overflow_days = (_UINT64_MAX // 86400) + 1
        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Overflow", reward="1", deadlineDays=overflow_days),
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, mode="wallet", planHash=plan_hash)
        request_ctx = _make_request()
        with mock.patch("routes.onebox.time.time", return_value=0):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await execute(request_ctx, execute_request)

        self.assertIsInstance(exc.exception.detail, dict)
        self.assertEqual(exc.exception.detail["code"], "DEADLINE_INVALID")
        self.assertEqual(
            exc.exception.detail["message"], _ERRORS["DEADLINE_INVALID"]["message"]
        )


class ExecutorRelayerFallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_execute_relayer_without_sender_returns_relay_unavailable(self) -> None:
        async def _fake_pin_json(metadata, file_name="payload.json"):
            return {
                "cid": "bafkrelayer",
                "uri": "ipfs://bafkrelayer",
                "gatewayUrl": "https://ipfs.io/ipfs/bafkrelayer",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafkrelayer"],
            }

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Example", reward="1", deadlineDays=1),
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, mode="relayer", planHash=plan_hash)
        request_ctx = _make_request()

        with mock.patch.object(onebox, "relayer", None), mock.patch(
            "routes.onebox._pin_json", side_effect=_fake_pin_json
        ), mock.patch("routes.onebox._compute_spec_hash", return_value=b"spec"):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await execute(request_ctx, execute_request)

        self.assertEqual(exc.exception.status_code, 400)
        self.assertIsInstance(exc.exception.detail, dict)
        self.assertEqual(exc.exception.detail.get("code"), "RELAY_UNAVAILABLE")

    async def test_execute_plan_intent_without_user_context_returns_relay_unavailable(self) -> None:
        async def _fake_pin_json(metadata, file_name="payload.json"):
            return {
                "cid": "bafkplan",
                "uri": "ipfs://bafkplan",
                "gatewayUrl": "https://ipfs.io/ipfs/bafkplan",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafkplan"],
            }

        plan_response = await plan(
            _make_request(), PlanRequest(text="Post a job offering 2 AGIALPHA within 3 days")
        )
        execute_request = ExecuteRequest(
            intent=plan_response.intent, mode="relayer", planHash=plan_response.planHash
        )
        request_ctx = _make_request()

        with mock.patch.object(onebox, "relayer", None), mock.patch(
            "routes.onebox._pin_json", side_effect=_fake_pin_json
        ), mock.patch("routes.onebox._compute_spec_hash", return_value=b"spec"):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await execute(request_ctx, execute_request)

        self.assertEqual(exc.exception.status_code, 400)
        self.assertIsInstance(exc.exception.detail, dict)
        self.assertEqual(exc.exception.detail.get("code"), "RELAY_UNAVAILABLE")
        self.assertEqual(exc.exception.detail.get("reason"), "MISSING_SENDER")

    async def test_finalize_relayer_without_sender_returns_relay_unavailable(self) -> None:
        intent = JobIntent(action="finalize_job", payload=Payload(jobId=123))
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, planHash=plan_hash)
        request_ctx = _make_request()

        with mock.patch.object(onebox, "relayer", None):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await execute(request_ctx, execute_request)

        self.assertEqual(exc.exception.status_code, 400)
        self.assertIsInstance(exc.exception.detail, dict)
        self.assertEqual(exc.exception.detail.get("code"), "RELAY_UNAVAILABLE")


class AccountAbstractionIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_execute_post_job_uses_account_abstraction_executor(self) -> None:
        spec_cid = "bafkaaexec"
        receipt_payload = {"status": 1}
        tooling_versions = {"router": "1.0.0"}

        async def _fake_pin_json(metadata, file_name="payload.json"):
            return {
                "cid": spec_cid,
                "uri": f"ipfs://{spec_cid}",
                "gatewayUrl": f"https://ipfs.io/ipfs/{spec_cid}",
                "gatewayUrls": [f"https://ipfs.io/ipfs/{spec_cid}"],
            }

        class _PolicyStore:
            def __init__(self) -> None:
                self.record = onebox.OrgPolicyRecord(max_budget_wei=10**19, max_duration_days=30)
                self.record.updated_at = "2024-01-01T00:00:00+00:00"

            def enforce(self, org_id, reward_wei, deadline_days):  # type: ignore[no-untyped-def]
                return self.record

        class _Executor:
            def __init__(self) -> None:
                self.calls: list[tuple[dict, Any]] = []

            async def execute(self, tx, context):  # type: ignore[no-untyped-def]
                self.calls.append((tx, context))
                return AccountAbstractionResult(
                    user_operation={"sender": "0xSession"},
                    user_operation_hash="0xuserop",
                    transaction_hash="0xtxn",
                    receipt=dict(receipt_payload),
                )

        executor = _Executor()

        registry_mock = mock.Mock()
        registry_mock.functions.postJob.return_value = mock.Mock()

        policy_store = _PolicyStore()
        plan_intent = JobIntent(
            action="post_job",
            payload=Payload(title="Example", reward="1", deadlineDays=2),
            userContext={"org": "acme"},
        )
        plan_hash = _register_plan(plan_intent)
        execute_request = ExecuteRequest(intent=plan_intent, planHash=plan_hash)
        request_ctx = _make_request()

        with mock.patch("routes.onebox._pin_json", side_effect=_fake_pin_json), mock.patch(
            "routes.onebox._compute_spec_hash", return_value=b"spec"
        ), mock.patch(
            "routes.onebox._build_tx",
            return_value={"gas": 50_000, "data": "0xdead", "to": "0xjob"},
        ), mock.patch(
            "routes.onebox._decode_job_created", return_value=99
        ), mock.patch(
            "routes.onebox._get_org_policy_store", return_value=policy_store
        ), mock.patch(
            "routes.onebox._collect_tooling_versions", return_value=tooling_versions
        ), mock.patch(
            "routes.onebox._get_aa_executor", return_value=executor
        ), mock.patch(
            "routes.onebox.registry", registry_mock
        ), mock.patch.object(
            onebox, "relayer", types.SimpleNamespace(address="0xRelayer"), create=True
        ):
            response = await execute(request_ctx, execute_request)

        self.assertEqual(response.jobId, 99)
        self.assertEqual(response.txHash, "0xtxn")
        self.assertTrue(response.receiptUrl.endswith("0xtxn"))
        self.assertEqual(response.status, "submitted")
        self.assertEqual(response.toolingVersions, tooling_versions)
        self.assertEqual(len(executor.calls), 1)
        _, ctx = executor.calls[0]
        self.assertIsNotNone(ctx)
        assert ctx is not None
        self.assertEqual(ctx.org_identifier, "acme")

    async def test_policy_rejection_falls_back_to_wallet_flow(self) -> None:
        async def _fake_pin_json(metadata, file_name="payload.json"):
            return {
                "cid": "bafkpolicy",
                "uri": "ipfs://bafkpolicy",
                "gatewayUrl": "https://ipfs.io/ipfs/bafkpolicy",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafkpolicy"],
            }

        class _PolicyStore:
            def enforce(self, org_id, reward_wei, deadline_days):  # type: ignore[no-untyped-def]
                return onebox.OrgPolicyRecord(max_budget_wei=None, max_duration_days=None)

        class _Executor:
            async def execute(self, tx, context):  # type: ignore[no-untyped-def]
                raise AAPolicyRejection("policy rejected")

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Example", reward="1", deadlineDays=1),
            userContext={"org": "acme"},
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, planHash=plan_hash)
        request_ctx = _make_request()

        with mock.patch("routes.onebox._pin_json", side_effect=_fake_pin_json), mock.patch(
            "routes.onebox._compute_spec_hash", return_value=b"spec"
        ), mock.patch(
            "routes.onebox._build_tx", return_value={"gas": 30_000}
        ), mock.patch(
            "routes.onebox._get_org_policy_store", return_value=_PolicyStore()
        ), mock.patch(
            "routes.onebox._collect_tooling_versions", return_value={}
        ), mock.patch(
            "routes.onebox._get_aa_executor", return_value=_Executor()
        ), mock.patch.object(
            onebox, "relayer", types.SimpleNamespace(address="0xRelayer"), create=True
        ):
            response = await execute(request_ctx, execute_request)

        self.assertIsNone(response.txHash)
        self.assertEqual(response.status, "prepared")
        self.assertIsNotNone(response.to)
        self.assertEqual(response.signer, None)

    async def test_paymaster_rejection_falls_back_to_wallet_flow(self) -> None:
        async def _fake_pin_json(metadata, file_name="payload.json"):
            return {
                "cid": "bafkpaymaster",
                "uri": "ipfs://bafkpaymaster",
                "gatewayUrl": "https://ipfs.io/ipfs/bafkpaymaster",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafkpaymaster"],
            }

        class _PolicyStore:
            def enforce(self, org_id, reward_wei, deadline_days):  # type: ignore[no-untyped-def]
                return onebox.OrgPolicyRecord(max_budget_wei=None, max_duration_days=None)

        class _Executor:
            async def execute(self, tx, context):  # type: ignore[no-untyped-def]
                raise AAPaymasterRejection("paymaster rejected")

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Example", reward="1", deadlineDays=1),
            userContext={"org": "acme"},
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, planHash=plan_hash)
        request_ctx = _make_request()

        with mock.patch("routes.onebox._pin_json", side_effect=_fake_pin_json), mock.patch(
            "routes.onebox._compute_spec_hash", return_value=b"spec"
        ), mock.patch(
            "routes.onebox._build_tx", return_value={"gas": 30_000}
        ), mock.patch(
            "routes.onebox._get_org_policy_store", return_value=_PolicyStore()
        ), mock.patch(
            "routes.onebox._collect_tooling_versions", return_value={}
        ), mock.patch(
            "routes.onebox._get_aa_executor", return_value=_Executor()
        ), mock.patch.object(
            onebox, "relayer", types.SimpleNamespace(address="0xRelayer"), create=True
        ):
            response = await execute(request_ctx, execute_request)

        self.assertIsNone(response.txHash)
        self.assertEqual(response.status, "prepared")
        self.assertIsNotNone(response.to)
        self.assertEqual(response.signer, None)

    async def test_bundler_simulation_error_surfaces_http_422(self) -> None:
        async def _fake_pin_json(metadata, file_name="payload.json"):
            return {
                "cid": "bafkfail",
                "uri": "ipfs://bafkfail",
                "gatewayUrl": "https://ipfs.io/ipfs/bafkfail",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafkfail"],
            }

        class _Executor:
            async def execute(self, tx, context):  # type: ignore[no-untyped-def]
                raise AABundlerError("simulation failed", simulation=True)

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Example", reward="1", deadlineDays=1),
            userContext={"org": "acme"},
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, planHash=plan_hash)
        request_ctx = _make_request()

        with mock.patch("routes.onebox._pin_json", side_effect=_fake_pin_json), mock.patch(
            "routes.onebox._compute_spec_hash", return_value=b"spec"
        ), mock.patch(
            "routes.onebox._build_tx", return_value={"gas": 30_000}
        ), mock.patch(
            "routes.onebox._get_org_policy_store", return_value=onebox.OrgPolicyStore()
        ), mock.patch(
            "routes.onebox._collect_tooling_versions", return_value={}
        ), mock.patch(
            "routes.onebox._get_aa_executor", return_value=_Executor()
        ), mock.patch.object(
            onebox, "relayer", types.SimpleNamespace(address="0xRelayer"), create=True
        ):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await execute(request_ctx, execute_request)

        self.assertEqual(exc.exception.status_code, 422)
        self.assertEqual(exc.exception.detail.get("code"), "AA_SIMULATION_FAILED")


class ReceiptPinningMetadataTests(unittest.IsolatedAsyncioTestCase):
    async def test_relayer_receipt_includes_policy_and_versions(self) -> None:
        spec_cid = "bafkspec123"
        receipt_cid = "bafkreceipt456"
        captured_receipt_payload: Optional[Dict[str, Any]] = None

        async def _fake_pin_json(metadata, file_name="payload.json"):
            nonlocal captured_receipt_payload
            if file_name == "job-spec.json":
                return {
                    "cid": spec_cid,
                    "uri": f"ipfs://{spec_cid}",
                    "gatewayUrl": f"https://ipfs.io/ipfs/{spec_cid}",
                    "gatewayUrls": [f"https://ipfs.io/ipfs/{spec_cid}"],
                }
            if file_name == "job-deliverable.json":
                captured_receipt_payload = json.loads(json.dumps(metadata))
                return {
                    "cid": receipt_cid,
                    "uri": f"ipfs://{receipt_cid}",
                    "gatewayUrl": f"https://ipfs.io/ipfs/{receipt_cid}",
                    "gatewayUrls": [
                        f"https://ipfs.io/ipfs/{receipt_cid}",
                        f"https://dweb.link/ipfs/{receipt_cid}",
                    ],
                }
            raise AssertionError(f"unexpected file name: {file_name}")

        async def _fake_send_relayer_tx(tx, *, mode="legacy", context=None):  # type: ignore[unused-argument]
            return "0xtxhash", {"status": 1}

        class _PolicyStore:
            def __init__(self) -> None:
                self.record = onebox.OrgPolicyRecord(
                    max_budget_wei=5 * 10**18,
                    max_duration_days=7,
                )
                self.record.updated_at = "2024-01-01T00:00:00+00:00"

            def enforce(self, org_id, reward_wei, deadline_days):  # type: ignore[no-untyped-def]
                return self.record

        tooling_versions = {"router": "1.2.3", "commit": "abc123"}
        relayer_account = types.SimpleNamespace(address="0x00000000000000000000000000000000000000Aa")
        policy_store = _PolicyStore()

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Metadata", reward="1", deadlineDays=2),
            userContext={"org": "acme"},
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, planHash=plan_hash)
        request_ctx = _make_request()

        post_job_func = mock.Mock()
        post_job_func.build_transaction.return_value = {"nonce": 1}

        registry_mock = mock.Mock()
        registry_mock.functions.postJob.return_value = post_job_func

        with mock.patch.object(onebox, "relayer", relayer_account), mock.patch(
            "routes.onebox._pin_json", side_effect=_fake_pin_json
        ), mock.patch(
            "routes.onebox._compute_spec_hash", return_value=b"spec"
        ), mock.patch(
            "routes.onebox._build_tx", return_value={"nonce": 1}
        ) as build_tx_mock, mock.patch(
            "routes.onebox._send_relayer_tx", side_effect=_fake_send_relayer_tx
        ), mock.patch(
            "routes.onebox._decode_job_created", return_value=77
        ), mock.patch(
            "routes.onebox._get_org_policy_store", return_value=policy_store
        ), mock.patch(
            "routes.onebox._collect_tooling_versions", return_value=tooling_versions
        ), mock.patch(
            "routes.onebox.registry", registry_mock
        ):
            response = await execute(request_ctx, execute_request)

        self.assertTrue(response.ok)
        self.assertEqual(response.jobId, 77)
        self.assertEqual(response.signer, relayer_account.address)
        self.assertEqual(response.toolingVersions, tooling_versions)
        self.assertIsNotNone(response.policySnapshot)
        assert response.policySnapshot is not None
        self.assertEqual(response.policySnapshot.get("org"), "acme")
        self.assertIn("maxBudgetWei", response.policySnapshot)
        self.assertEqual(response.resultCid, receipt_cid)
        self.assertEqual(response.resultGatewayUrl, f"https://ipfs.io/ipfs/{receipt_cid}")
        self.assertIn(f"https://dweb.link/ipfs/{receipt_cid}", response.resultGatewayUrls or [])
        self.assertIsNotNone(response.receipt)
        assert response.receipt is not None
        self.assertEqual(response.receipt.get("resultCid"), receipt_cid)

        self.assertIsNotNone(captured_receipt_payload)
        assert captured_receipt_payload is not None
        self.assertIn("policySnapshot", captured_receipt_payload)
        self.assertIn("toolingVersions", captured_receipt_payload)
        self.assertEqual(captured_receipt_payload.get("signer"), relayer_account.address)
        self.assertEqual(captured_receipt_payload.get("resultCid"), spec_cid)

        build_tx_mock.assert_called_once()

class RelayerTransactionTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_relayer_tx_allows_concurrent_tasks(self) -> None:
        loop = asyncio.get_running_loop()
        wait_started = asyncio.Event()
        release = threading.Event()
        receipt_payload = {"status": 1}
        tx = {"nonce": 7}

        mock_relayer = mock.Mock()
        mock_relayer.address = "0x0000000000000000000000000000000000000000"
        mock_relayer.sign_transaction.return_value = types.SimpleNamespace(rawTransaction=b"\xaa")

        def _fake_wait(tx_hash: str, timeout: int = 180):
            loop.call_soon_threadsafe(wait_started.set)
            if not release.wait(timeout=1):
                raise AssertionError("release signal not triggered")
            return receipt_payload

        expected_tx_hash = b"\x99".hex()

        with mock.patch.object(onebox, "relayer", mock_relayer), mock.patch.object(
            onebox.w3.eth, "send_raw_transaction", return_value=b"\x99"
        ) as send_mock, mock.patch.object(
            onebox.w3.eth, "wait_for_transaction_receipt", side_effect=_fake_wait
        ) as wait_mock:
            send_task = asyncio.create_task(onebox._send_relayer_tx(tx, mode="legacy"))

            async def _other_task() -> str:
                await wait_started.wait()
                return "progressed"

            other_task = asyncio.create_task(_other_task())
            other_result = await asyncio.wait_for(other_task, timeout=1)
            self.assertEqual(other_result, "progressed")
            self.assertFalse(send_task.done())

            release.set()
            tx_hash, receipt = await asyncio.wait_for(send_task, timeout=1)

        self.assertEqual(tx_hash, expected_tx_hash)
        self.assertEqual(receipt, receipt_payload)
        mock_relayer.sign_transaction.assert_called_once_with(tx)
        send_mock.assert_called_once_with(mock_relayer.sign_transaction.return_value.rawTransaction)
        wait_mock.assert_called_once_with(expected_tx_hash, timeout=180)


class OrgPolicyEnforcementTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tempdir.cleanup)
        policy_path = os.path.join(self._tempdir.name, "policies.json")
        store = OrgPolicyStore(
            policy_path=policy_path,
            default_max_budget_wei=2 * 10**18,
            default_max_duration_days=5,
        )
        self._store_patcher = mock.patch("routes.onebox._ORG_POLICY_STORE", store)
        self._store_patcher.start()
        self.addCleanup(self._store_patcher.stop)

    async def test_execute_within_policy_logs_acceptance(self) -> None:
        events = []

        async def _fake_pin_json(metadata, file_name="payload.json"):
            return {
                "cid": "bafkpolicy",
                "uri": "ipfs://bafkpolicy",
                "gatewayUrl": "https://ipfs.io/ipfs/bafkpolicy",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafkpolicy"],
            }

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Policy", reward="1.5", deadlineDays=4),
            userContext={"orgId": "acme"},
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, mode="wallet", planHash=plan_hash)
        request_ctx = _make_request()

        def _capture_event(level, event, correlation_id, **fields):  # type: ignore[no-untyped-def]
            events.append((level, event, fields))

        with mock.patch("routes.onebox._pin_json", side_effect=_fake_pin_json), mock.patch(
            "routes.onebox.time.time", return_value=2_000_000
        ), mock.patch("routes.onebox._compute_spec_hash", return_value=b"policy"), mock.patch(
            "routes.onebox._log_event", side_effect=_capture_event
        ):
            response = await execute(request_ctx, execute_request)

        self.assertTrue(response.ok)
        self.assertTrue(
            any(event == "onebox.policy.accepted" for _, event, _ in events),
            msg="expected acceptance event",
        )

    async def test_execute_rejected_when_budget_exceeds_cap(self) -> None:
        events = []

        async def _fake_pin_json(metadata, file_name="payload.json"):
            return {
                "cid": "bafkpolicy",
                "uri": "ipfs://bafkpolicy",
                "gatewayUrl": "https://ipfs.io/ipfs/bafkpolicy",
                "gatewayUrls": ["https://ipfs.io/ipfs/bafkpolicy"],
            }

        intent = JobIntent(
            action="post_job",
            payload=Payload(title="Policy", reward="3", deadlineDays=4),
            userContext={"orgId": "acme"},
        )
        plan_hash = _register_plan(intent)
        execute_request = ExecuteRequest(intent=intent, mode="wallet", planHash=plan_hash)
        request_ctx = _make_request()

        def _capture_event(level, event, correlation_id, **fields):  # type: ignore[no-untyped-def]
            events.append((level, event, fields))

        with mock.patch("routes.onebox._pin_json", side_effect=_fake_pin_json), mock.patch(
            "routes.onebox.time.time", return_value=2_000_000
        ), mock.patch("routes.onebox._compute_spec_hash", return_value=b"policy"), mock.patch(
            "routes.onebox._log_event", side_effect=_capture_event
        ):
            with self.assertRaises(fastapi.HTTPException) as exc:
                await execute(request_ctx, execute_request)

        self.assertEqual(exc.exception.status_code, 400)
        self.assertIsInstance(exc.exception.detail, dict)
        self.assertEqual(exc.exception.detail.get("code"), "JOB_BUDGET_CAP_EXCEEDED")
        self.assertTrue(
            any(
                event == "onebox.policy.rejected" and fields.get("reason") == "JOB_BUDGET_CAP_EXCEEDED"
                for _, event, fields in events
            ),
            msg="expected rejection event",
        )


class StatusReadTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_status_open_with_metadata(self) -> None:
        job = {
            "agent": "0x0000000000000000000000000000000000000000",
            "reward": 10**18,
            "packedMetadata": _encode_metadata(1, deadline=1_700_000_000),
        }

        with mock.patch("routes.onebox.registry") as registry_mock, mock.patch(
            "routes.onebox.AGIALPHA_TOKEN", "0xToken"
        ):
            registry_mock.functions.jobs.return_value.call.return_value = job
            status = await _read_status(42)

        self.assertEqual(status.jobId, 42)
        self.assertEqual(status.state, "open")
        self.assertEqual(status.reward, "1")
        self.assertEqual(status.token, "0xToken")
        self.assertEqual(status.deadline, 1_700_000_000)
        self.assertIsNone(status.assignee)

    async def test_read_status_assigned_sets_assignee(self) -> None:
        agent = "0x00000000000000000000000000000000000000aB"
        job = {
            "agent": agent,
            "reward": 5 * 10**18,
            "packedMetadata": _encode_metadata(2, deadline=0),
        }

        with mock.patch("routes.onebox.registry") as registry_mock, mock.patch(
            "routes.onebox.AGIALPHA_TOKEN", "0xToken"
        ):
            registry_mock.functions.jobs.return_value.call.return_value = job
            status = await _read_status(7)

        self.assertEqual(status.state, "assigned")
        self.assertEqual(status.reward, "5")
        self.assertEqual(status.token, "0xToken")
        self.assertIsNone(status.deadline)
        self.assertEqual(status.assignee, Web3.to_checksum_address(agent))

    async def test_read_status_completed_handles_legacy_shape(self) -> None:
        agent = "0x0000000000000000000000000000000000000Aa"
        legacy_job = [
            "0x0000000000000000000000000000000000000001",
            agent,
            2 * 10**18,
            0,
            0,
            4,
            True,
            0,
            1_800_000_000,
            0,
            b"",
            b"",
        ]

        with mock.patch("routes.onebox.registry") as registry_mock, mock.patch(
            "routes.onebox.AGIALPHA_TOKEN", "0xToken"
        ):
            registry_mock.functions.jobs.return_value.call.return_value = legacy_job
            status = await _read_status(99)

        self.assertEqual(status.state, "completed")
        self.assertEqual(status.reward, "2")
        self.assertEqual(status.token, "0xToken")
        self.assertEqual(status.deadline, 1_800_000_000)
        self.assertEqual(status.assignee, Web3.to_checksum_address(agent))

    async def test_read_status_finalized_state(self) -> None:
        job = {
            "agent": "0x00000000000000000000000000000000000000ff",
            "reward": 3 * 10**18,
            "packedMetadata": _encode_metadata(6, deadline=1_900_000_000),
        }

        with mock.patch("routes.onebox.registry") as registry_mock, mock.patch(
            "routes.onebox.AGIALPHA_TOKEN", "0xToken"
        ):
            registry_mock.functions.jobs.return_value.call.return_value = job
            status = await _read_status(123)

        self.assertEqual(status.state, "finalized")
        self.assertEqual(status.reward, "3")
        self.assertEqual(status.token, "0xToken")
        self.assertEqual(status.deadline, 1_900_000_000)

    async def test_read_status_gracefully_handles_checksum_failures(self) -> None:
        agent = "0x0000000000000000000000000000000000000001"
        job = {
            "agent": agent,
            "reward": 10**18,
            "packedMetadata": _encode_metadata(2, deadline=0),
        }

        with mock.patch("routes.onebox.registry") as registry_mock, mock.patch(
            "routes.onebox.AGIALPHA_TOKEN", "0xToken"
        ), mock.patch("routes.onebox.Web3.to_checksum_address", side_effect=ValueError("boom")):
            registry_mock.functions.jobs.return_value.call.return_value = job
            status = await _read_status(55)

        self.assertEqual(status.state, "assigned")
        self.assertEqual(status.assignee, agent)

    async def test_read_status_returns_unknown_on_error(self) -> None:
        with mock.patch("routes.onebox.registry") as registry_mock:
            registry_mock.functions.jobs.side_effect = Exception("boom")
            status = await _read_status(55)

        self.assertEqual(status.state, "unknown")
        self.assertIsNone(status.reward)
        self.assertIsNone(status.token)
        self.assertIsNone(status.deadline)


class JobCreatedDecodingTests(unittest.TestCase):
    def test_decode_job_created_with_full_event_payload(self) -> None:
        receipt = {"logs": ["dummy"]}
        event_args = {
            "jobId": 123,
            "employer": "0x0000000000000000000000000000000000000001",
            "agent": "0x0000000000000000000000000000000000000002",
            "reward": 10,
            "stake": 5,
            "fee": 1,
            "specHash": "0x" + "00" * 32,
            "uri": "ipfs://example",
        }
        job_created_event = mock.Mock()
        job_created_event.process_receipt.return_value = [{"args": event_args}]

        with mock.patch("routes.onebox.registry") as registry_mock:
            registry_mock.events.JobCreated.return_value = job_created_event
            next_job_id = registry_mock.functions.nextJobId
            next_job_id.return_value.call.return_value = 0

            job_id = _decode_job_created(receipt)

        self.assertEqual(job_id, 123)
        job_created_event.process_receipt.assert_called_once_with(receipt)
        next_job_id.assert_not_called()

    def test_decode_job_created_falls_back_to_next_job_id(self) -> None:
        receipt = {"status": 1}
        with mock.patch("routes.onebox.registry") as registry_mock:
            job_created_event = registry_mock.events.JobCreated.return_value
            job_created_event.process_receipt.return_value = []
            next_job_id_call = registry_mock.functions.nextJobId.return_value
            next_job_id_call.call.return_value = 77

            job_id = _decode_job_created(receipt)

        self.assertEqual(job_id, 77)
        job_created_event.process_receipt.assert_called_once_with(receipt)
        next_job_id_call.call.assert_called_once_with()


class HealthcheckTests(unittest.IsolatedAsyncioTestCase):
    async def test_healthcheck_returns_minimal_ok_payload(self) -> None:
        data = await healthcheck(_make_request())
        self.assertEqual(data, {"ok": True})


class HealthcheckRouteTests(unittest.TestCase):
    @unittest.skipUnless(hasattr(fastapi, "FastAPI"), "FastAPI application not available")
    def test_health_endpoint_is_mounted_without_onebox_prefix(self) -> None:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(router)
        app.include_router(health_router)

        response = TestClient(app).get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})


class MetricsEndpointTests(unittest.TestCase):
    def test_metrics_endpoint_returns_prometheus_payload(self) -> None:
        response = metrics_endpoint()
        self.assertEqual(response.media_type, prometheus_client.CONTENT_TYPE_LATEST)
        self.assertIsInstance(getattr(response, "body", b""), (bytes, bytearray))


if __name__ == "__main__":
    unittest.main()
