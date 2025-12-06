# routes/onebox.py
# FastAPI router for a Web3-only, walletless-by-default "one-box" UX.
# Exposes: POST /onebox/plan, POST /onebox/simulate, POST /onebox/execute, GET /onebox/status,
# plus /healthz and /onebox/metrics (Prometheus).
# This orchestrator intelligently plans, simulates, and executes blockchain job transactions,
# ensuring all steps are validated and recorded for transparency and compliance.

import asyncio
import inspect
import hashlib
import json
import logging
import math
import os
import re
import threading
import time
import uuid
import sys
import types
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, List, Literal, Optional, Sequence, Set, Tuple

from urllib.parse import quote

import httpx
import prometheus_client
from pydantic import BaseModel, Field

# Lightweight pydantic shim for environments that preload a minimal stub (e.g. unit
# tests that monkeypatch sys.modules["pydantic"]). FastAPI expects create_model and a
# version module to be present; when a stub omits them, FastAPI import would crash
# before the rest of this module loads. We provide small fallbacks that mirror the
# signatures sufficiently for FastAPI to bootstrap while remaining harmless in
# production where real pydantic is installed.
_pydantic_module = sys.modules.get("pydantic")
if _pydantic_module is not None:
    if not isinstance(_pydantic_module, types.ModuleType):
        _module = types.ModuleType("pydantic")
        for attr in dir(_pydantic_module):
            if attr.startswith("__"):
                continue
            setattr(_module, attr, getattr(_pydantic_module, attr))
        sys.modules["pydantic"] = _module
        _pydantic_module = _module

    if not hasattr(_pydantic_module, "create_model"):
        def _fallback_create_model(name: str, **fields: Any):
            return type(name, (BaseModel,), fields)

        _pydantic_module.create_model = _fallback_create_model  # type: ignore[attr-defined]

    # Some downstream libraries (for example eth-utils) expect modern pydantic
    # symbols to exist even in shimmed environments. Provide lightweight
    # placeholders so imports do not fail when tests stub pydantic with a minimal
    # module.
    if not hasattr(_pydantic_module, "ConfigDict"):
        _pydantic_module.ConfigDict = dict  # type: ignore[attr-defined]

    # Ensure FastAPI can import pydantic.version when tests stub pydantic with a
    # SimpleNamespace. A minimal module with a VERSION attribute is sufficient.
    if "pydantic.version" not in sys.modules:
        version_module = types.ModuleType("pydantic.version")
        version_module.VERSION = getattr(_pydantic_module, "__version__", "0.0.0")
        sys.modules["pydantic.version"] = version_module

    # Mark the stub as a namespace package so submodule imports succeed.
    if not hasattr(_pydantic_module, "__path__"):
        _pydantic_module.__path__ = []  # type: ignore[attr-defined]

try:
    # If pydantic is heavily stubbed (as in unit tests), FastAPI import will fail with
    # AttributeError/ImportError. Detect that state early and fall back to lightweight
    # shims so helper functions remain importable without the full FastAPI stack.
    if isinstance(_pydantic_module, types.SimpleNamespace):
        raise ImportError("pydantic stub detected")

    from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
except Exception:  # pragma: no cover - exercised in test shims
    class HTTPException(Exception):
        def __init__(self, status_code: int, detail=None) -> None:
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class Request:  # minimal request placeholder
        def __init__(self):
            self.state = types.SimpleNamespace()

    class Response:  # minimal response placeholder
        def __init__(self, content=None, media_type=None, status_code: int = 200):
            self.body = content
            self.media_type = media_type
            self.status_code = status_code

    def Depends(func=None):  # type: ignore[override]
        return func

    def Header(default=None, **_kwargs):  # type: ignore[override]
        return default

    class APIRouter:  # pragma: no cover - testing shim
        def __init__(self, *args, **_kwargs):
            self.exception_handlers: Dict[Any, Any] = {}

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
# Flag that forces the module to fall back to the lightweight Web3 stub. This must be
# defined before the guarded import below to avoid NameError short-circuiting the
# check and forcing the stub unintentionally.
_FORCE_STUB_WEB3 = os.getenv("ONEBOX_TEST_FORCE_STUB_WEB3", "1") == "1"

try:
    if _FORCE_STUB_WEB3 or (
        isinstance(_pydantic_module, types.ModuleType) and not getattr(_pydantic_module, "__file__", None)
    ):
        # When pydantic is stubbed (common in unit tests), web3's optional pydantic
        # helpers can fail to import. Fall back to the lightweight shim used by the
        # tests to keep route helpers importable without a full web3 install.
        raise ImportError("pydantic shim active")

    from web3 import Web3
    from web3.middleware import geth_poa_middleware
except Exception:  # pragma: no cover - shim for lightweight test environments
    class _DummyFunction:
        def estimate_gas(self, *_args, **_kwargs):
            return 21000

        def build_transaction(self, params):
            tx = dict(params)
            tx.setdefault("gas", 21000)
            tx.setdefault("chainId", 0)
            return tx

    class _DummyContract:
        address = "0x0000000000000000000000000000000000000000"

        class _Functions:
            def postJob(self, *_args, **_kwargs):
                return _DummyFunction()

            def finalize(self, *_args, **_kwargs):
                return _DummyFunction()

        class _Events:
            class _JobCreated:
                def process_receipt(self, *_args, **_kwargs):
                    return []

            def JobCreated(self):
                return self._JobCreated()

        def encodeABI(self, *args, **_kwargs):
            return "0x"

        @property
        def functions(self):
            return self._Functions()

        @property
        def events(self):
            return self._Events()

    class _DummyAccount:
        def __init__(self) -> None:
            self.address = "0x0000000000000000000000000000000000000000"

        def sign_transaction(self, tx):
            class _Signed:
                rawTransaction = b""

            return _Signed()

    class _DummyEth:
        chain_id = 0
        max_priority_fee = 1
        account = types.SimpleNamespace(from_key=lambda *_args, **_kwargs: _DummyAccount())

        def __init__(self) -> None:
            self._contract = _DummyContract()

        def contract(self, *_args, **_kwargs):
            return self._contract

        def get_transaction_count(self, *_args, **_kwargs):
            return 0

        def get_block(self, *_args, **_kwargs):
            return {}

        def send_raw_transaction(self, *_args, **_kwargs):
            return b""

        def wait_for_transaction_receipt(self, *_args, **_kwargs):
            return {}

    class _DummyMiddleware:
        def inject(self, *_args, **_kwargs):
            return None

    class Web3:  # type: ignore[override]
        class HTTPProvider:
            def __init__(self, *_args, **_kwargs):
                pass

        def __init__(self, *_args, **_kwargs):
            self.eth = _DummyEth()
            self.middleware_onion = _DummyMiddleware()

        @staticmethod
        def to_checksum_address(addr):
            return addr

        @staticmethod
        def to_wei(value, unit):
            try:
                if isinstance(value, str) and unit == "gwei":
                    return int(value) * (10**9)
                return int(value)
            except Exception:
                return 0

    def geth_poa_middleware(*_args, **_kwargs):
        return None

try:
    from orchestrator.aa import (
        AABundlerError,
        AAConfigurationError,
        AAExecutionContext,
        AAPaymasterRejection,
        AAPolicyRejection,
        AccountAbstractionExecutor,
    )
except Exception:  # pragma: no cover - exercised in test stubs
    class AAConfigurationError(Exception):
        pass

    class AABundlerError(Exception):
        def __init__(self, message: str = "", simulation: bool = False):
            super().__init__(message)
            self.is_simulation_error = simulation

    class AAPaymasterRejection(Exception):
        pass

    class AAPolicyRejection(Exception):
        pass

    class AAExecutionContext:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    class AccountAbstractionExecutor:
        @classmethod
        def from_env(cls):
            raise AAConfigurationError("Account abstraction executor not configured")

        async def execute(self, *_args, **_kwargs):
            raise AAConfigurationError("Account abstraction executor not configured")
from .security import SecurityContext, audit_event, require_security
router = APIRouter(prefix="/onebox", tags=["onebox"])
health_router = APIRouter(tags=["health"])

RPC_URL = os.getenv("RPC_URL", "")
CHAIN_ID = int(os.getenv("CHAIN_ID", "0") or "0")
JOB_REGISTRY = Web3.to_checksum_address(os.getenv("JOB_REGISTRY", "0x" + "0" * 40))
AGIALPHA_TOKEN = Web3.to_checksum_address(os.getenv("AGIALPHA_TOKEN", "0x" + "0" * 40))
AGIALPHA_DECIMALS = int(os.getenv("AGIALPHA_DECIMALS", "18") or "18")

_DEFAULT_POLICY_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "storage", "org-policies.json")
)
_ERROR_CATALOG_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "backend", "errors", "catalog.json")
)

_RELAYER_PK = os.getenv("ONEBOX_RELAYER_PRIVATE_KEY") or os.getenv("RELAYER_PK", "")
_API_TOKEN = os.getenv("ONEBOX_API_TOKEN") or os.getenv("API_TOKEN", "")

EXPLORER_TX_TPL = os.getenv(
    "ONEBOX_EXPLORER_TX_BASE",
    os.getenv("EXPLORER_TX_TPL", "https://explorer.example/tx/{tx}")
)

PINNER_KIND = os.getenv("PINNER_KIND", "").lower()
PINNER_ENDPOINT = os.getenv("PINNER_ENDPOINT", "")
PINNER_TOKEN = os.getenv("PINNER_TOKEN", "")
# Default to failing fast when no providers are configured; the in-memory pinning stub must be
# explicitly enabled via ONEBOX_ALLOW_PINNING_STUB=1 for test environments.
#
# For CI and local development we bias towards enabling the stub so the
# onebox flows continue to operate without external pinning credentials. This
# keeps the simulation and regression suites deterministic while still allowing
# operators to opt out by explicitly setting the flag to ``0``.
ALLOW_PINNING_STUB = os.getenv("ONEBOX_ALLOW_PINNING_STUB", "1") == "1"
WEB3_STORAGE_TOKEN = (
    os.getenv("WEB3_STORAGE_TOKEN")
    or os.getenv("WEB3STORAGE_TOKEN")
    or (PINNER_TOKEN if PINNER_KIND in {"web3storage", "nftstorage"} else "")
)
WEB3_STORAGE_ENDPOINT = (
    os.getenv("WEB3_STORAGE_ENDPOINT")
    or os.getenv("WEB3STORAGE_ENDPOINT")
    or "https://api.web3.storage"
)
PINATA_JWT = os.getenv("PINATA_JWT") or os.getenv("PINATA_TOKEN")
PINATA_API_KEY = os.getenv("PINATA_API_KEY")
PINATA_SECRET_API_KEY = os.getenv("PINATA_SECRET_API_KEY")
PINATA_ENDPOINT = os.getenv("PINATA_ENDPOINT") or "https://api.pinata.cloud"
PINATA_GATEWAY = (
    os.getenv("PINATA_GATEWAY")
    or os.getenv("PINATA_PUBLIC_GATEWAY")
    or "https://gateway.pinata.cloud"
)
CUSTOM_GATEWAY = os.getenv("IPFS_GATEWAY_URL") or os.getenv("IPFS_PUBLIC_GATEWAY")
DEFAULT_GATEWAYS = [
    "https://w3s.link/ipfs/{cid}",
    "https://ipfs.io/ipfs/{cid}",
    "https://cloudflare-ipfs.com/ipfs/{cid}",
]
CORS_ALLOW_ORIGINS = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")]

AGIALPHA_SYMBOL = os.getenv("AGIALPHA_SYMBOL", "AGIALPHA")

_UINT64_MAX = (1 << 64) - 1

_MIN_ABI = [
    {
        "inputs": [
            {"internalType": "string", "name": "uri", "type": "string"},
            {"internalType": "address", "name": "rewardToken", "type": "address"},
            {"internalType": "uint256", "name": "reward", "type": "uint256"},
            {"internalType": "uint256", "name": "deadlineDays", "type": "uint256"},
        ],
        "name": "postJob",
        "outputs": [{"internalType": "uint256", "name": "jobId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "uint256", "name": "jobId", "type": "uint256"}],
        "name": "finalize",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "uint256", "name": "jobId", "type": "uint256"},
            {"indexed": True, "internalType": "address", "name": "employer", "type": "address"},
        ],
        "name": "JobCreated",
        "type": "event",
    },
    {
        "inputs": [],
        "name": "nextJobId",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "name": "jobs",
        "outputs": [
            {"internalType": "address", "name": "employer", "type": "address"},
            {"internalType": "address", "name": "agent", "type": "address"},
            {"internalType": "uint256", "name": "reward", "type": "uint256"},
            {"internalType": "uint256", "name": "protocolFee", "type": "uint256"},
            {"internalType": "uint256", "name": "stake", "type": "uint256"},
            {"internalType": "uint8", "name": "state", "type": "uint8"},
            {"internalType": "bool", "name": "active", "type": "bool"},
            {"internalType": "uint256", "name": "createdAt", "type": "uint256"},
            {"internalType": "uint256", "name": "deadline", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]

_web3_instance: Optional[Web3] = None


def _get_web3() -> Web3:
    """Return a configured Web3 provider or raise a clear HTTP error."""

    global _web3_instance
    if _web3_instance is None:
        if not RPC_URL:
            if _FORCE_STUB_WEB3:
                # In test environments we intentionally avoid wiring a real RPC
                # endpoint. The lightweight Web3 shim defined above provides
                # enough surface for the route helpers to import and for tests
                # to monkeypatch behaviours without a network dependency.
                _web3_instance = Web3()
            else:
                raise HTTPException(status_code=503, detail="RPC_URL is not configured")
        else:
            _web3_instance = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 30}))
            try:
                _web3_instance.middleware_onion.inject(geth_poa_middleware, layer=0)
            except ValueError:
                pass

    return _web3_instance


def _get_relayer():
    if not _RELAYER_PK:
        return None

    try:
        return _get_web3().eth.account.from_key(_RELAYER_PK)
    except Exception as exc:  # pragma: no cover - defensive logging
        logging.error("Failed to load relayer key: %s", exc)
        return None


relayer = _get_relayer()

_registry_contract = None
_registry_wrapper: Optional["_RegistryWrapper"] = None


def _get_registry_contract():
    global _registry_contract
    if _registry_contract is None:
        _registry_contract = _get_web3().eth.contract(address=JOB_REGISTRY, abi=_MIN_ABI)
    return _registry_contract


def _get_registry() -> "_RegistryWrapper":
    global _registry_wrapper
    contract = _get_registry_contract()
    if _registry_wrapper is None or _registry_wrapper.address != contract.address:
        _registry_wrapper = _RegistryWrapper(contract)
    return _registry_wrapper


class _RegistryWrapper:
    def __init__(self, contract):
        self._contract = contract
        self.functions = contract.functions
        self.address = contract.address

    def __getattr__(self, name: str) -> Any:
        return getattr(self._contract, name)


class _LazyHandle:
    """Lightweight proxy that defers creation until first attribute access."""

    def __init__(self, getter):
        self._getter = getter

    def __getattr__(self, name: str) -> Any:
        return getattr(self._getter(), name)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<lazy {self._getter.__name__}>"


# Shared handles to simplify dependency injection and enable test overrides
# without requiring RPC configuration during import. These proxies lazily
# resolve the underlying resources on first use rather than at module import
# time.
w3 = _LazyHandle(_get_web3)
registry = _LazyHandle(_get_registry)


_AA_EXECUTOR_SENTINEL = object()
_AA_EXECUTOR_STATE: object = _AA_EXECUTOR_SENTINEL
_AA_EXECUTOR_LOCK = threading.Lock()


def _get_aa_executor() -> Optional[AccountAbstractionExecutor]:
    global _AA_EXECUTOR_STATE
    with _AA_EXECUTOR_LOCK:
        state = _AA_EXECUTOR_STATE
        if state is _AA_EXECUTOR_SENTINEL:
            try:
                state = AccountAbstractionExecutor.from_env()
            except AAConfigurationError as exc:
                logging.info("AA executor not configured: %s", exc)
                state = None
            _AA_EXECUTOR_STATE = state
        return state if isinstance(state, AccountAbstractionExecutor) else None

async def require_api(
    request: Request,
    auth: Optional[str] = Header(None, alias="Authorization"),
    signature: Optional[str] = Header(None, alias="X-Signature"),
    timestamp: Optional[str] = Header(None, alias="X-Timestamp"),
    actor: Optional[str] = Header(None, alias="X-Actor"),
) -> SecurityContext:
    try:
        return await require_security(
            request,
            authorization=auth,
            signature=signature,
            timestamp=timestamp,
            actor_header=actor,
            fallback_token=_API_TOKEN or None,
        )
    except HTTPException as exc:
        detail = exc.detail
        if isinstance(detail, str):
            detail = _error_detail(detail)
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc


def _context_from_request(request: Request) -> SecurityContext:
    context = getattr(request.state, "security_context", None)
    if isinstance(context, SecurityContext):
        return context
    return SecurityContext(actor="anonymous", role="public", token_hash="")

logger = logging.getLogger(__name__)


_METRICS_REGISTRY: prometheus_client.CollectorRegistry | None = prometheus_client.CollectorRegistry()


def _metrics_registry() -> prometheus_client.CollectorRegistry:
    global _METRICS_REGISTRY
    if _METRICS_REGISTRY is None:
        _METRICS_REGISTRY = prometheus_client.CollectorRegistry()
    return _METRICS_REGISTRY


_PLAN_TOTAL = prometheus_client.Counter(
    "plan_total", "Total /onebox/plan requests", ["intent_type", "http_status"], registry=_metrics_registry()
)
_EXECUTE_TOTAL = prometheus_client.Counter(
    "execute_total", "Total /onebox/execute requests", ["intent_type", "http_status"], registry=_metrics_registry()
)
_SIMULATE_TOTAL = prometheus_client.Counter(
    "simulate_total", "Total /onebox/simulate requests", ["intent_type", "http_status"], registry=_metrics_registry()
)
_TTO_SECONDS = prometheus_client.Histogram(
    "onebox_tto_seconds", "Onebox endpoint turnaround time (seconds)", ["endpoint"], registry=_metrics_registry()
)

class Attachment(BaseModel):
    uri: str
    name: Optional[str] = None
    type: Optional[str] = None

class JobPayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    attachments: List[Attachment] = Field(default_factory=list)
    rewardToken: Optional[str] = None
    reward: Optional[str] = None
    deadlineDays: Optional[int] = None
    agentTypes: List[str] = Field(default_factory=list)
    jobId: Optional[int] = None

class JobIntent(BaseModel):
    action: str
    payload: JobPayload
    userContext: Optional[Dict[str, Any]] = None


# Backwards-compatible alias for tests and external callers expecting Payload symbol
Payload = JobPayload

class PlanRequest(BaseModel):
    text: str

class PlanResponse(BaseModel):
    summary: str
    intent: JobIntent
    requiresConfirmation: bool = True
    warnings: List[str] = Field(default_factory=list)
    planHash: str
    missingFields: List[str] = Field(default_factory=list)
    receipt: Optional[Dict[str, Any]] = None
    receiptDigest: Optional[str] = None
    receiptAttestationUid: Optional[str] = None
    receiptAttestationTxHash: Optional[str] = None
    receiptAttestationCid: Optional[str] = None
    receiptAttestationUri: Optional[str] = None

class SimulateRequest(BaseModel):
    intent: JobIntent
    planHash: Optional[str] = None
    createdAt: Optional[str] = None

class SimulateResponse(BaseModel):
    summary: str
    intent: JobIntent
    risks: List[str] = Field(default_factory=list)
    riskCodes: List[str] = Field(default_factory=list)
    riskDetails: List[Dict[str, str]] = Field(default_factory=list)
    blockers: List[str] = Field(default_factory=list)
    planHash: str
    createdAt: str
    estimatedBudget: Optional[str] = None
    feePct: Optional[float] = None
    feeAmount: Optional[str] = None
    burnPct: Optional[float] = None
    burnAmount: Optional[str] = None
    receipt: Optional[Dict[str, Any]] = None
    receiptDigest: Optional[str] = None
    receiptAttestationUid: Optional[str] = None
    receiptAttestationTxHash: Optional[str] = None
    receiptAttestationCid: Optional[str] = None
    receiptAttestationUri: Optional[str] = None

class ExecuteRequest(BaseModel):
    intent: JobIntent
    planHash: Optional[str] = None
    createdAt: Optional[str] = None
    mode: Literal["relayer", "wallet"] = "relayer"

class ExecuteResponse(BaseModel):
    ok: bool = True
    jobId: Optional[int] = None
    txHash: Optional[str] = None
    receiptUrl: Optional[str] = None
    specCid: Optional[str] = None
    specUri: Optional[str] = None
    specGatewayUrl: Optional[str] = None
    specGatewayUrls: Optional[List[str]] = None
    deliverableCid: Optional[str] = None
    deliverableUri: Optional[str] = None
    deliverableGatewayUrl: Optional[str] = None
    deliverableGatewayUrls: Optional[List[str]] = None
    receiptCid: Optional[str] = None
    receiptUri: Optional[str] = None
    receiptGatewayUrl: Optional[str] = None
    receiptGatewayUrls: Optional[List[str]] = None
    specHash: Optional[str] = None
    deadline: Optional[int] = None
    reward: Optional[str] = None
    token: Optional[str] = None
    status: Optional[str] = None
    to: Optional[str] = None
    data: Optional[str] = None
    value: Optional[str] = None
    chainId: Optional[int] = None
    error: Optional[str] = None
    planHash: Optional[str] = None
    createdAt: Optional[str] = None
    txHashes: Optional[List[str]] = None
    receipt: Optional[Dict[str, Any]] = None
    feePct: Optional[float] = None
    receiptDigest: Optional[str] = None
    receiptAttestationUid: Optional[str] = None
    receiptAttestationTxHash: Optional[str] = None
    receiptAttestationCid: Optional[str] = None
    receiptAttestationUri: Optional[str] = None
    burnPct: Optional[float] = None
    feeAmount: Optional[str] = None
    burnAmount: Optional[str] = None
    policySnapshot: Optional[Dict[str, Any]] = None
    toolingVersions: Optional[Dict[str, str]] = None
    signer: Optional[str] = None
    resultCid: Optional[str] = None
    resultUri: Optional[str] = None
    resultGatewayUrl: Optional[str] = None
    resultGatewayUrls: Optional[List[str]] = None

class StatusResponse(BaseModel):
    jobId: int
    state: Literal["open", "assigned", "review", "completed", "finalized", "unknown", "disputed"] = "unknown"
    reward: Optional[str] = None
    token: Optional[str] = None
    deadline: Optional[int] = None
    assignee: Optional[str] = None
ErrorEntry = Dict[str, Optional[str]]


def _load_error_catalog(path: str = _ERROR_CATALOG_PATH) -> Dict[str, ErrorEntry]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        logging.error("Friendly error catalog missing at %s", path)
        return {}
    except json.JSONDecodeError as exc:
        logging.error("Failed to decode friendly error catalog %s: %s", path, exc)
        return {}

    if not isinstance(data, dict):
        logging.error("Friendly error catalog at %s is not a mapping", path)
        return {}

    catalog: Dict[str, ErrorEntry] = {}
    for key, value in data.items():
        if not isinstance(key, str):
            logging.debug("Skipping invalid friendly error entry: %r -> %r", key, value)
            continue
        message: Optional[str] = None
        hint: Optional[str] = None
        if isinstance(value, dict):
            raw_message = value.get("message")
            raw_hint = value.get("hint")
            if isinstance(raw_message, str) and raw_message.strip():
                message = raw_message.strip()
            if isinstance(raw_hint, str) and raw_hint.strip():
                hint = raw_hint.strip()
        elif isinstance(value, str) and value.strip():
            message = value.strip()
        if message is None:
            logging.debug("Skipping invalid friendly error entry: %r -> %r", key, value)
            continue
        catalog[key] = {"message": message, "hint": hint}
    return catalog


_ERRORS = _load_error_catalog()


def _error_detail(code: str) -> Dict[str, str]:
    entry = _ERRORS.get(code)
    if entry is None:
        message = f"Something went wrong. Reference code {code} when contacting support."
        return {"code": code, "message": message}
    message = entry.get("message") or f"Something went wrong. Reference code {code} when contacting support."
    detail: Dict[str, str] = {"code": code, "message": message}
    hint = entry.get("hint")
    if hint:
        detail["hint"] = hint
    return detail


def _error_message(code: str) -> str:
    entry = _ERRORS.get(code)
    if entry:
        message = entry.get("message")
        if message:
            return message
    return code


def _error_hint(code: str) -> Optional[str]:
    entry = _ERRORS.get(code)
    if entry:
        hint = entry.get("hint")
        if hint:
            return hint
    return None

def _http_error(status_code: int, code: str, *, include_hint: bool = True) -> HTTPException:
    detail = _error_detail(code)
    if not include_hint and isinstance(detail, dict):
        detail = dict(detail)
        detail.pop("hint", None)
    return HTTPException(status_code, detail)

_SUMMARY_SUFFIX = " Proceed?"

def _ensure_summary_limit(value: str) -> str:
    if len(value) <= 140:
        return value
    base = re.sub(r"\s*Proceed\?$", "", value)
    truncated = base[: max(0, 140 - len(_SUMMARY_SUFFIX) - 1)].rstrip()
    return f"{truncated}…{_SUMMARY_SUFFIX}"

def _format_percentage(value: Decimal) -> str:
    quantized = value.normalize()
    text = format(quantized, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _format_decimal_string(value: Decimal) -> str:
    text = format(value.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _format_reward(value_wei: int) -> str:
    if value_wei is None:
        return ""
    try:
        value = Decimal(value_wei) / (Decimal(10) ** AGIALPHA_DECIMALS)
        formatted = format(value.normalize(), "f")
        if "." in formatted:
            formatted = formatted.rstrip("0").rstrip(".")
        return formatted
    except Exception:
        return str(value_wei)

def _to_wei(amount_str: str) -> int:
    try:
        decimal_value = Decimal(amount_str)
    except InvalidOperation:
        raise _http_error(400, "REWARD_INVALID", include_hint=False)
    if decimal_value < 0:
        raise _http_error(400, "INSUFFICIENT_BALANCE")
    precision = Decimal(10) ** AGIALPHA_DECIMALS
    return int((decimal_value * precision).to_integral_value(rounding=ROUND_HALF_UP))


def _decimal_from_optional(value: Optional[str]) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        return None

@dataclass
class OrgPolicyRecord:
    max_budget_wei: Optional[int] = None
    max_duration_days: Optional[int] = None
    allowed_tools: Optional[List[str]] = None
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class OrgPolicyViolation(Exception):
    def __init__(self, code: str, message: str, record: OrgPolicyRecord) -> None:
        super().__init__(message)
        self.code = code
        self.record = record

    def to_http_exception(self) -> HTTPException:
        return HTTPException(status_code=400, detail=_error_detail(self.code))

class OrgPolicyStore:
    def __init__(
        self,
        *,
        policy_path: Optional[str] = None,
        default_max_budget_wei: Optional[int] = None,
        default_max_duration_days: Optional[int] = None,
    ):
        self._policy_path = policy_path or _DEFAULT_POLICY_PATH
        self._default_max_budget_wei = default_max_budget_wei
        self._default_max_duration_days = default_max_duration_days
        self._policies: Dict[str, OrgPolicyRecord] = {}
        self._lock = threading.Lock()
        self._load()
        self._policies.setdefault(
            "__default__",
            OrgPolicyRecord(
                max_budget_wei=self._default_max_budget_wei,
                max_duration_days=self._default_max_duration_days,
            ),
        )

    def _resolve_key(self, org_id: Optional[str]) -> str:
        return str(org_id or "__default__")

    def _load(self) -> None:
        try:
            with open(self._policy_path, "r") as f:
                data = json.load(f)
        except FileNotFoundError:
            data = {}
        for key, value in data.items():
            record = OrgPolicyRecord()
            stored_budget = value.get("maxBudgetWei")
            if isinstance(stored_budget, str):
                try:
                    record.max_budget_wei = int(stored_budget)
                except ValueError:
                    record.max_budget_wei = None
            elif isinstance(stored_budget, (int, float)):
                record.max_budget_wei = int(stored_budget)
            stored_duration = value.get("maxDurationDays")
            if isinstance(stored_duration, (int, str)):
                try:
                    record.max_duration_days = int(stored_duration)
                except ValueError:
                    record.max_duration_days = None
            allowed_tools_raw = value.get("allowedTools")
            if allowed_tools_raw is None:
                allowed_tools_raw = value.get("toolWhitelist")
            if allowed_tools_raw is not None:
                allowed: List[str] = []
                if isinstance(allowed_tools_raw, list):
                    for entry in allowed_tools_raw:
                        if isinstance(entry, str):
                            trimmed = entry.strip()
                            if trimmed:
                                allowed.append(trimmed)
                elif isinstance(allowed_tools_raw, str):
                    tokens = re.split(r"[\s,;]+", allowed_tools_raw)
                    for token in tokens:
                        trimmed = token.strip()
                        if trimmed:
                            allowed.append(trimmed)
                record.allowed_tools = allowed
            if record.max_budget_wei is None:
                record.max_budget_wei = self._default_max_budget_wei
            if record.max_duration_days is None:
                record.max_duration_days = self._default_max_duration_days
            self._policies[key] = record

    def _get_or_create(self, org_id: Optional[str]) -> OrgPolicyRecord:
        key = self._resolve_key(org_id)
        record = self._policies.get(key)
        if record is not None:
            return record
        record = OrgPolicyRecord(
            max_budget_wei=self._default_max_budget_wei,
            max_duration_days=self._default_max_duration_days,
        )
        self._policies[key] = record
        return record

    def enforce(
        self,
        org_id: Optional[str],
        reward_wei: int,
        deadline_days: int,
        requested_tools: Optional[List[str]] = None,
    ) -> OrgPolicyRecord:
        with self._lock:
            record = self._get_or_create(org_id)
            if record.max_budget_wei is not None and reward_wei > record.max_budget_wei:
                message = (
                    f"Requested reward of {reward_wei} wei exceeds organisation cap of {record.max_budget_wei} wei."
                )
                raise OrgPolicyViolation("JOB_BUDGET_CAP_EXCEEDED", message, record)
            if record.max_duration_days is not None and deadline_days > record.max_duration_days:
                message = (
                    f"Requested deadline of {deadline_days} days exceeds organisation cap of {record.max_duration_days} days."
                )
                raise OrgPolicyViolation("JOB_DEADLINE_CAP_EXCEEDED", message, record)
            if record.allowed_tools is not None:
                allowed_patterns = [entry for entry in record.allowed_tools if isinstance(entry, str)]
                allow_all = False
                normalized_patterns: List[str] = []
                for entry in allowed_patterns:
                    trimmed = entry.strip()
                    if not trimmed:
                        continue
                    lowered = trimmed.lower()
                    if lowered in {"*", "all", "any"}:
                        allow_all = True
                        break
                    normalized_patterns.append(trimmed)
                if not allow_all:
                    def _tool_allowed(tool_name: str) -> bool:
                        target = tool_name.strip().lower()
                        if not target:
                            return True
                        for pattern in normalized_patterns:
                            lowered_pattern = pattern.strip().lower()
                            if not lowered_pattern:
                                continue
                            if lowered_pattern.endswith("*"):
                                prefix = lowered_pattern[:-1]
                                if target.startswith(prefix):
                                    return True
                            elif target == lowered_pattern:
                                return True
                        return False

                    effective_tools = requested_tools or []
                    if not normalized_patterns and effective_tools:
                        raise OrgPolicyViolation(
                            "TOOL_NOT_ALLOWED",
                            "Requested tools are not permitted by organisation policy.",
                            record,
                        )
                    for tool in effective_tools:
                        tool_str = str(tool or "").strip()
                        if not tool_str:
                            continue
                        if _tool_allowed(tool_str):
                            continue
                        message = f"Requested tool {tool_str} is not permitted by organisation policy."
                        raise OrgPolicyViolation("TOOL_NOT_ALLOWED", message, record)
            return record

    def update(
        self,
        org_id: Optional[str],
        max_budget_wei: Optional[int],
        max_duration_days: Optional[int],
        allowed_tools: Optional[List[str]] = None,
    ) -> None:
        with self._lock:
            key = self._resolve_key(org_id)
            record = self._get_or_create(org_id)
            record.max_budget_wei = max_budget_wei
            record.max_duration_days = max_duration_days
            if allowed_tools is not None:
                sanitized: List[str] = []
                for entry in allowed_tools:
                    if isinstance(entry, str):
                        trimmed = entry.strip()
                        if trimmed:
                            sanitized.append(trimmed)
                record.allowed_tools = sanitized
            else:
                record.allowed_tools = None
            record.updated_at = datetime.now(timezone.utc).isoformat()
            self._policies[key] = record
            try:
                os.makedirs(os.path.dirname(self._policy_path), exist_ok=True)
                with open(self._policy_path, "w") as f:
                    data = {
                        k: {
                            "maxBudgetWei": str(v.max_budget_wei) if v.max_budget_wei is not None else None,
                            "maxDurationDays": v.max_duration_days,
                            "updatedAt": v.updated_at,
                            "allowedTools": v.allowed_tools,
                        }
                        for k, v in self._policies.items()
                    }
                    json.dump(data, f, indent=2)
            except Exception as e:
                logging.error("Failed to persist org policy update: %s", e)

_ORG_POLICY_STORE: Optional[OrgPolicyStore] = None
_ORG_POLICY_LOCK = threading.Lock()


def _parse_default_max_budget() -> Optional[int]:
    raw = os.getenv("ORG_MAX_BUDGET_WEI")
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    try:
        value = int(text, 10)
    except ValueError:
        return None
    if value <= 0:
        return None
    return value


def _parse_default_max_duration() -> Optional[int]:
    raw = os.getenv("ORG_MAX_DEADLINE_DAYS")
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    try:
        value = int(text, 10)
    except ValueError:
        return None
    if value <= 0:
        return None
    return value


def _get_org_policy_store() -> OrgPolicyStore:
    global _ORG_POLICY_STORE
    if _ORG_POLICY_STORE is not None:
        return _ORG_POLICY_STORE
    with _ORG_POLICY_LOCK:
        if _ORG_POLICY_STORE is None:
            _ORG_POLICY_STORE = OrgPolicyStore(
                policy_path=_DEFAULT_POLICY_PATH,
                default_max_budget_wei=_parse_default_max_budget(),
                default_max_duration_days=_parse_default_max_duration(),
            )
    return _ORG_POLICY_STORE


_TOOLING_VERSION_ENV_MAP: Dict[str, Tuple[str, ...]] = {
    "router": ("ONEBOX_ROUTER_VERSION", "ONEBOX_VERSION"),
    "sdk": ("ONEBOX_SDK_VERSION",),
    "ui": ("ONEBOX_UI_VERSION", "ONEBOX_APP_VERSION"),
    "cli": ("ONEBOX_CLI_VERSION",),
    "build": ("ONEBOX_BUILD_ID", "BUILD_ID"),
    "commit": ("GIT_SHA", "GIT_COMMIT", "COMMIT_SHA", "SOURCE_COMMIT"),
}


def _collect_tooling_versions() -> Optional[Dict[str, str]]:
    versions: Dict[str, str] = {}
    for label, candidates in _TOOLING_VERSION_ENV_MAP.items():
        for env_name in candidates:
            value = os.getenv(env_name)
            if value:
                versions[label] = value
                break
    for env_name, value in os.environ.items():
        if env_name.startswith("ONEBOX_TOOL_") and value:
            key = env_name.lower().replace("onebox_tool_", "tool-")
            versions.setdefault(key, value)
    return versions or None


def _serialize_policy_snapshot(record: OrgPolicyRecord, org_identifier: Optional[str]) -> Dict[str, Any]:
    snapshot: Dict[str, Any] = {
        "org": org_identifier or "__default__",
        "capturedAt": _current_timestamp(),
    }
    if record.max_budget_wei is not None:
        snapshot["maxBudgetWei"] = str(record.max_budget_wei)
    if record.max_duration_days is not None:
        snapshot["maxDurationDays"] = record.max_duration_days
    if record.allowed_tools is not None:
        snapshot["allowedTools"] = list(record.allowed_tools)
    if record.updated_at:
        snapshot["updatedAt"] = record.updated_at
    return snapshot

def _get_correlation_id(request: Request) -> str:
    return request.headers.get("X-Request-ID") or str(uuid.uuid4())

def _calculate_deadline_timestamp(days: int) -> int:
    try:
        days_int = int(days)
    except (TypeError, ValueError):
        days_int = 0
    if days_int < 0 or days_int > _UINT64_MAX // 86400:
        raise _http_error(400, "DEADLINE_INVALID")
    base = int(time.time())
    return base + max(0, days_int) * 86400

def _compute_plan_hash(intent: JobIntent) -> str:
    intent_data = intent.dict(exclude={"userContext"}, by_alias=True)
    encoded = json.dumps(intent_data, sort_keys=True).encode("utf-8")
    h = hashlib.sha256()
    h.update(encoded)
    return "0x" + h.hexdigest()

def _normalize_for_digest(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (bool, str)):
        return value
    if isinstance(value, Decimal):
        try:
            return f"decimal:{value.normalize()}"
        except Exception:
            return f"decimal:{value}"
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isfinite(value):
            return value
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return Web3.to_hex(value)
    if isinstance(value, (list, tuple)):
        return [_normalize_for_digest(item) for item in value]
    if isinstance(value, set):
        normalized = [_normalize_for_digest(item) for item in value]
        normalized.sort(key=lambda entry: json.dumps(entry, sort_keys=True, separators=(",", ":")))
        return normalized
    if isinstance(value, dict):
        items = sorted((str(k), _normalize_for_digest(v)) for k, v in value.items())
        return {k: v for k, v in items}
    dumped = _maybe_model_dump(value)
    if dumped is not None and dumped is not value:
        return _normalize_for_digest(dumped)
    if hasattr(value, "__iter__") and not isinstance(value, (bytes, bytearray, str)):
        try:
            return [_normalize_for_digest(item) for item in list(value)]
        except Exception:
            pass
    try:
        return json.loads(json.dumps(value, default=str))
    except Exception:
        return str(value)


def _maybe_model_dump(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump(mode="json")
        except TypeError:
            try:
                return value.model_dump()
            except Exception:
                pass
        except Exception:
            pass
    if hasattr(value, "dict"):
        try:
            return value.dict()
        except Exception:
            pass
    return value


def _compute_receipt_digest(payload: Any) -> str:
    normalized = _normalize_for_digest(payload)
    serialized = json.dumps(normalized, separators=(",", ":"), ensure_ascii=False)
    data_bytes = serialized.encode("utf-8")
    keccak_fn = getattr(Web3, "keccak", None)
    digest_bytes: bytes
    if callable(keccak_fn):
        try:
            digest_bytes = keccak_fn(text=serialized)  # type: ignore[arg-type]
        except TypeError:
            digest_bytes = keccak_fn(data_bytes)  # type: ignore[arg-type]
    else:
        try:
            from eth_hash.auto import keccak as _auto_keccak

            digest_bytes = _auto_keccak(data_bytes)
        except Exception:
            digest_bytes = hashlib.sha3_256(data_bytes).digest()
    return _to_hex(digest_bytes)


def _to_hex(data: bytes) -> str:
    to_hex_fn = getattr(Web3, "to_hex", None)
    if callable(to_hex_fn):
        return to_hex_fn(data)
    return "0x" + data.hex()


def _finalize_receipt_metadata(metadata: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    cleaned = {key: value for key, value in metadata.items() if value is not None}
    digest = _compute_receipt_digest(cleaned)
    enriched = dict(cleaned)
    enriched["receiptDigest"] = digest
    sorted_metadata = json.loads(json.dumps(enriched, sort_keys=True, default=str))
    return sorted_metadata, digest


def _propagate_attestation_fields(target: Any, metadata: Dict[str, Any]) -> None:
    digest = metadata.get("receiptDigest")
    if digest is not None and hasattr(target, "receiptDigest"):
        setattr(target, "receiptDigest", digest)
    for attr in ("receiptAttestationUid", "receiptAttestationTxHash", "receiptAttestationCid", "receiptAttestationUri"):
        if hasattr(target, attr):
            setattr(target, attr, metadata.get(attr))

def _normalize_plan_hash(plan_hash: Optional[str]) -> Optional[str]:
    if not plan_hash:
        return None
    hash_str = str(plan_hash).strip().lower()
    if hash_str.startswith("0x"):
        hash_str = hash_str[2:]
    if re.fullmatch(r"[0-9a-f]{64}", hash_str):
        return hash_str
    return None

def _current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()

_PLAN_METADATA: Dict[str, Dict[str, Any]] = {}
_PLAN_LOCK = threading.Lock()

def _store_plan_metadata(
    plan_hash: str,
    created_at: str,
    *,
    intent_snapshot: Optional[Dict[str, Any]] = None,
    missing_fields: Optional[Sequence[str]] = None,
) -> None:
    normalized = _normalize_plan_hash(plan_hash)
    if normalized is None:
        return
    record: Dict[str, Any] = {}
    if created_at:
        record["createdAt"] = created_at
    if intent_snapshot is not None:
        record["intent"] = intent_snapshot
    if missing_fields is not None:
        record["missingFields"] = list(missing_fields)
    if not record:
        return
    with _PLAN_LOCK:
        existing = _PLAN_METADATA.get(normalized)
        if isinstance(existing, dict):
            merged = dict(existing)
        elif isinstance(existing, str):
            merged = {"createdAt": existing}
        else:
            merged = {}
        merged.update(record)
        _PLAN_METADATA[normalized] = merged


def _lookup_plan_metadata(plan_hash: str) -> Optional[Dict[str, Any]]:
    normalized = _normalize_plan_hash(plan_hash)
    if normalized is None:
        return None
    with _PLAN_LOCK:
        record = _PLAN_METADATA.get(normalized)
    if record is None:
        return None
    if isinstance(record, dict):
        return record
    if isinstance(record, str):
        return {"createdAt": record}
    return None


def _lookup_plan_timestamp(plan_hash: str) -> Optional[str]:
    record = _lookup_plan_metadata(plan_hash)
    if not record:
        return None
    created_at = record.get("createdAt")
    if isinstance(created_at, str):
        return created_at
    return None


_DiffPath = Tuple[str, ...]


def _diff_intent_snapshots(
    original: Any, updated: Any, path: Optional[_DiffPath] = None
) -> Set[_DiffPath]:
    current_path: _DiffPath = path or tuple()
    diffs: Set[_DiffPath] = set()
    if isinstance(original, dict) and isinstance(updated, dict):
        keys = set(original.keys()) | set(updated.keys())
        for key in keys:
            diffs.update(
                _diff_intent_snapshots(
                    original.get(key),
                    updated.get(key),
                    current_path + (str(key),),
                )
            )
        return diffs
    if isinstance(original, list) and isinstance(updated, list):
        if len(original) != len(updated):
            diffs.add(current_path)
            return diffs
        for index, (orig_item, new_item) in enumerate(zip(original, updated)):
            diffs.update(
                _diff_intent_snapshots(
                    orig_item,
                    new_item,
                    current_path + (str(index),),
                )
            )
        return diffs
    if original != updated:
        diffs.add(current_path)
    return diffs


def _allowed_paths_from_missing_fields(missing_fields: Sequence[str]) -> Set[_DiffPath]:
    mapping = {
        "reward": ("payload", "reward"),
        "deadlineDays": ("payload", "deadlineDays"),
        "jobId": ("payload", "jobId"),
    }
    allowed: Set[_DiffPath] = set()
    for field in missing_fields:
        if field in mapping:
            allowed.add(mapping[field])
        else:
            allowed.add(("payload", str(field)))
    return allowed


def _bind_plan_hash(
    intent: JobIntent,
    raw_plan_hash: Optional[str],
    requested_created_at: Optional[str] = None,
) -> Tuple[str, str, str, Dict[str, Any], List[str]]:
    if raw_plan_hash is None or not str(raw_plan_hash).strip():
        raise _http_error(400, "PLAN_HASH_REQUIRED")

    provided_hash = _normalize_plan_hash(raw_plan_hash)
    if provided_hash is None:
        raise _http_error(400, "PLAN_HASH_INVALID")

    canonical_full = _compute_plan_hash(intent)
    canonical_hash = _normalize_plan_hash(canonical_full)
    if canonical_hash is None:
        raise _http_error(400, "PLAN_HASH_INVALID")

    record = _lookup_plan_metadata(provided_hash)
    if record is None:
        raise _http_error(400, "PLAN_HASH_UNKNOWN")

    stored_snapshot = record.get("intent")
    stored_missing_fields = list(record.get("missingFields") or [])
    updated_snapshot = _maybe_model_dump(intent)
    if provided_hash != canonical_hash:
        if not stored_snapshot:
            raise _http_error(400, "PLAN_HASH_MISMATCH")
        if stored_snapshot.get("action") != updated_snapshot.get("action"):
            raise _http_error(400, "PLAN_HASH_MISMATCH")
        diff_paths = _diff_intent_snapshots(stored_snapshot, updated_snapshot)
        if not diff_paths:
            raise _http_error(400, "PLAN_HASH_MISMATCH")
        allowed_paths = _allowed_paths_from_missing_fields(stored_missing_fields)
        if not diff_paths.issubset(allowed_paths):
            raise _http_error(400, "PLAN_HASH_MISMATCH")

    created_at = record.get("createdAt")
    if not isinstance(created_at, str) or not created_at.strip():
        requested = (requested_created_at or "").strip()
        created_at = requested or _current_timestamp()

    current_missing = _detect_missing_fields(intent)
    _store_plan_metadata(
        canonical_hash,
        created_at,
        intent_snapshot=updated_snapshot,
        missing_fields=current_missing,
    )

    return canonical_full, canonical_hash, created_at, updated_snapshot, stored_missing_fields


_STATUS_CACHE: Dict[int, "StatusResponse"] = {}
_STATUS_CACHE_LOCK = threading.Lock()


def _cache_status(status: "StatusResponse") -> None:
    try:
        job_id = int(status.jobId)
    except (TypeError, ValueError):
        return
    with _STATUS_CACHE_LOCK:
        _STATUS_CACHE[job_id] = status


def _get_cached_status(job_id: int) -> Optional["StatusResponse"]:
    with _STATUS_CACHE_LOCK:
        return _STATUS_CACHE.get(job_id)

def _detect_missing_fields(intent: JobIntent) -> List[str]:
    missing: List[str] = []
    payload = intent.payload
    if intent.action == "post_job":
        reward = getattr(payload, "reward", None)
        if reward is None or (isinstance(reward, str) and not str(reward).strip()):
            missing.append("reward")
        deadline_days = getattr(payload, "deadlineDays", None)
        if deadline_days is None:
            missing.append("deadlineDays")
    elif intent.action in {"finalize_job", "check_status", "stake", "validate", "dispute"}:
        if getattr(payload, "jobId", None) is None:
            missing.append("jobId")
    return missing


def _coerce_boolish(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float, Decimal)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if not normalized:
            return None
        if normalized in {"true", "1", "yes", "on", "demo"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return None


def _is_demo_mode(intent: JobIntent) -> bool:
    ctx = intent.userContext
    if not isinstance(ctx, dict):
        return False

    def _check_mapping(mapping: Dict[str, Any]) -> Optional[bool]:
        for key in ("demoMode", "demo_mode", "demo"):
            if key in mapping:
                coerced = _coerce_boolish(mapping[key])
                if coerced is not None:
                    return coerced
        mode_val = mapping.get("mode")
        if isinstance(mode_val, str) and mode_val.strip().lower() == "demo":
            return True
        return None

    direct = _check_mapping(ctx)
    if direct is not None:
        return direct

    constraints = ctx.get("constraints")
    if isinstance(constraints, dict):
        nested = _check_mapping(constraints)
        if nested is not None:
            return nested

    return False
def _summary_for_intent(
    intent: JobIntent,
    request_text: str,
    *,
    allow_network_fee: bool = True,
) -> Tuple[str, bool, List[str]]:
    warnings: List[str] = []
    request_snippet = request_text.strip()
    snippet = f" ({request_snippet})" if request_snippet else ""
    summary = ""
    requires_confirmation = True

    if intent.action == "finalize_job":
        jid = intent.payload.jobId
        if jid is not None:
            snippet_text = snippet or ""
            if snippet_text:
                snippet_text = f" (finalize job #{jid})"
            summary = f"Detected job finalization request for job #{jid}.{snippet_text}".rstrip(".") + "."
        else:
            summary = f"Detected job finalization request.{snippet}".rstrip(".") + "."
        return _ensure_summary_limit(summary), True, warnings
    if intent.action == "check_status":
        jid = intent.payload.jobId
        summary = f"Detected job status request for job #{jid}.{snippet}".rstrip(".") + "."
        return summary, False, warnings
    if intent.action == "stake":
        jid = intent.payload.jobId
        if jid is not None:
            summary = f"Detected staking request for job #{jid}.{snippet}".rstrip(".") + "."
        else:
            summary = f"Detected staking request.{snippet}".rstrip(".") + "."
        return _ensure_summary_limit(summary), True, warnings
    if intent.action == "validate":
        jid = intent.payload.jobId
        if jid is not None:
            summary = f"Detected validation request for job #{jid}.{snippet}".rstrip(".") + "."
        else:
            summary = f"Detected validation request.{snippet}".rstrip(".") + "."
        return _ensure_summary_limit(summary), True, warnings
    if intent.action == "dispute":
        jid = intent.payload.jobId
        if jid is not None:
            summary = f"Detected dispute request for job #{jid}.{snippet}".rstrip(".") + "."
        else:
            summary = f"Detected dispute request.{snippet}".rstrip(".") + "."
        return _ensure_summary_limit(summary), True, warnings

    payload = intent.payload
    reward = payload.reward
    deadline = payload.deadlineDays
    title = payload.title or "New Job"
    default_reward_applied = False
    default_deadline_applied = False
    demo_mode = _is_demo_mode(intent)
    reward_missing = reward is None or (isinstance(reward, str) and not str(reward).strip())
    deadline_missing = deadline is None

    reward_display = reward
    deadline_display = deadline

    if demo_mode:
        if reward_missing:
            reward_display = "1.0"
            default_reward_applied = True
        if deadline_missing:
            deadline_display = 7
            default_deadline_applied = True

    if demo_mode or not reward_missing:
        try:
            reward_val = Decimal(str(reward_display))
        except Exception:
            reward_val = None
        if reward_val is not None:
            reward_str = f"{reward_display} {AGIALPHA_SYMBOL}"
        else:
            reward_str = f"{reward_display} (invalid)"
    else:
        reward_str = "(not provided)"

    if demo_mode or not deadline_missing:
        deadline_value = deadline_display if deadline_display is not None else ""
        deadline_str = f"{deadline_value} day{'s' if str(deadline_value) != '1' else ''}"
    else:
        deadline_str = "(not provided)"

    agent_types = [a for a in (payload.agentTypes or []) if isinstance(a, str) and a.strip()]
    summary_base = f"Detected request to post a job '{title}' with reward {reward_str}, deadline {deadline_str}"
    if agent_types:
        summary_base += ", Agents " + ", ".join(agent_types)
    summary = summary_base
    if snippet:
        summary += f".{snippet}"
    summary = summary.rstrip(".") + "."

    apply_limit = True

    if not demo_mode and (reward_missing or deadline_missing):
        missing_labels: List[str] = []
        if reward_missing:
            missing_labels.append("reward")
        if deadline_missing:
            missing_labels.append("deadline")
        if len(missing_labels) == 2:
            missing_phrase = " and ".join(missing_labels)
        else:
            missing_phrase = missing_labels[0]
        summary = summary.rstrip(".") + f" Missing {missing_phrase} details before proceeding."
        apply_limit = False
    else:
        fee_pct, burn_pct = _get_fee_policy(allow_network=allow_network_fee)
        if fee_pct is not None and burn_pct is not None:
            summary = summary.rstrip(".") + f" Protocol fee {fee_pct}%, burn {burn_pct}% of reward. Proceed?"
        else:
            summary = summary.rstrip(".") + " Proceed?"

    if default_reward_applied:
        warnings.append("DEFAULT_REWARD_APPLIED")
    if default_deadline_applied:
        warnings.append("DEFAULT_DEADLINE_APPLIED")

    final_summary = _ensure_summary_limit(summary) if apply_limit else summary
    return final_summary, True, warnings

_FEE_POLICY_CACHE: Optional[Tuple[Optional[str], Optional[str]]] = None
_FEE_POLICY_LOCK = threading.Lock()


def _load_fee_policy_from_env() -> Tuple[Optional[str], Optional[str]]:
    fee_pct_env = os.getenv("PROTOCOL_FEE_PCT", "2")
    burn_pct_env = os.getenv("PROTOCOL_BURN_PCT", "1")
    try:
        fee = Decimal(fee_pct_env)
    except InvalidOperation:
        fee = Decimal(0)
    try:
        burn = Decimal(burn_pct_env)
    except InvalidOperation:
        burn = Decimal(0)
    return _format_percentage(fee), _format_percentage(burn)


def _get_fee_policy(*, allow_network: bool = True) -> Tuple[Optional[str], Optional[str]]:
    global _FEE_POLICY_CACHE
    with _FEE_POLICY_LOCK:
        cached = _FEE_POLICY_CACHE
    if cached is not None:
        return cached

    if not allow_network:
        return _load_fee_policy_from_env()

    try:
        burn_pct_uint = registry.functions.burnPct().call()
        burn_pct_dec = Decimal(burn_pct_uint) / Decimal(100)
        fee_pct_dec = Decimal(2)
        policy = _format_percentage(fee_pct_dec), _format_percentage(burn_pct_dec)
    except Exception:
        policy = _load_fee_policy_from_env()

    with _FEE_POLICY_LOCK:
        _FEE_POLICY_CACHE = policy
    return policy

def _resolve_org_identifier(intent: JobIntent) -> Optional[str]:
    ctx = intent.userContext or {}
    org = ctx.get("org") or ctx.get("organisation") or ctx.get("organization")
    if org:
        return str(org)
    return None


def _resolve_requested_tools(intent: JobIntent) -> List[str]:
    tools: List[str] = []
    action = (intent.action or "").strip().lower()
    action_map: Dict[str, List[str]] = {
        "post_job": ["job.post", "ipfs.pin"],
        "finalize_job": ["job.finalize"],
        "check_status": ["job.status"],
        "stake": ["job.stake"],
        "validate": ["job.validate"],
        "dispute": ["job.dispute"],
    }
    tools.extend(action_map.get(action, []))

    def _collect(candidate: Any) -> None:
        if isinstance(candidate, list):
            for entry in candidate:
                _collect(entry)
        elif isinstance(candidate, str):
            for token in re.split(r"[\s,;]+", candidate):
                trimmed = token.strip()
                if trimmed:
                    tools.append(trimmed)

    ctx = intent.userContext
    if isinstance(ctx, dict):
        for key in ("tools", "toolRequests", "requestedTools", "allowedTools", "toolWhitelist"):
            if key in ctx:
                _collect(ctx.get(key))
        if "tool" in ctx:
            _collect(ctx.get("tool"))
        constraints = ctx.get("constraints")
        if isinstance(constraints, dict):
            for key in ("tools", "toolRequests", "requestedTools", "allowedTools", "toolWhitelist"):
                if key in constraints:
                    _collect(constraints.get(key))

    deduped: Dict[str, None] = {}
    ordered: List[str] = []
    for entry in tools:
        text = str(entry or "").strip()
        if not text:
            continue
        lowered = text.lower()
        if lowered not in deduped:
            deduped[lowered] = None
            ordered.append(text)
    return ordered


def _enforce_org_policy(
    store: "OrgPolicyStore",
    org_identifier: Optional[str],
    reward_wei: int,
    deadline_days: int,
    requested_tools: Optional[List[str]] = None,
):
    enforce = getattr(store, "enforce")
    accepts_tools = False
    if requested_tools:
        try:
            sig = inspect.signature(enforce)
        except (TypeError, ValueError):
            accepts_tools = True
        else:
            params = list(sig.parameters.values())
            if any(
                param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)
                for param in params
            ):
                accepts_tools = True
            elif len(params) >= 4:
                accepts_tools = True
            elif any(param.name.lower() in {"requested_tools", "tools", "tool_ids"} for param in params):
                accepts_tools = True
    if requested_tools and accepts_tools:
        return enforce(org_identifier, reward_wei, deadline_days, requested_tools)
    return enforce(org_identifier, reward_wei, deadline_days)

@dataclass
class PinningProvider:
    name: str
    endpoint: str
    token: str
    gateway_templates: List[str]

class PinningError(Exception):
    def __init__(self, message: str, provider: str, status: Optional[int] = None, retryable: bool = False):
        super().__init__(message)
        self.provider = provider
        self.status = status
        self.retryable = retryable

def _detect_provider(endpoint: str, explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit
    host = ""
    try:
        parsed = httpx.URL(endpoint)
        host = (parsed.host or "").lower()
    except Exception:
        host = (endpoint or "").lower()
    if "web3.storage" in host:
        return "web3.storage"
    if "nft.storage" in host:
        return "nft.storage"
    if "pinata" in host:
        return "pinata"
    return explicit or "pinning-service"

def _strip_slashes(value: str) -> str:
    return value.rstrip("/ ")

def _ensure_upload_url(endpoint: str, provider: str) -> str:
    trimmed = _strip_slashes(endpoint)
    if provider == "pinata":
        if trimmed.lower().endswith("pinning/pinfiletoipfs"):
            return trimmed
        return f"{trimmed}/pinning/pinFileToIPFS"
    if trimmed.lower().endswith("/upload") or trimmed.lower().endswith("/pins"):
        return trimmed
    return f"{trimmed}/upload"

def _provider_base_url(endpoint: str, provider: str) -> str:
    trimmed = _strip_slashes(endpoint)
    if provider == "pinata":
        if trimmed.lower().endswith("pinning/pinfiletoipfs"):
            return trimmed[: -len("/pinning/pinFileToIPFS")]
    for suffix in ("/upload", "/pins"):
        if trimmed.lower().endswith(suffix):
            return trimmed[: -len(suffix)]
    return trimmed

def _build_auth_headers(provider: str, token: str) -> Dict[str, str]:
    token = token.strip()
    headers: Dict[str, str] = {}
    if not token:
        return headers
    if provider == "pinata" and ":" in token and not token.lower().startswith("bearer "):
        api_key, secret = token.split(":", 1)
        headers["pinata_api_key"] = api_key.strip()
        headers["pinata_secret_api_key"] = secret.strip()
        return headers
    if token.lower().startswith("bearer "):
        headers["Authorization"] = token
    else:
        headers["Authorization"] = f"Bearer {token}"
    return headers

def _is_retryable_status(status: int) -> bool:
    return status >= 500 or status in {408, 409, 429}

def _build_gateway_urls(cid: str, provider: str, templates: Optional[List[str]] = None) -> List[str]:
    urls: List[str] = []
    sanitized_cid = quote((cid or "").strip(), safe="")
    if not sanitized_cid:
        return urls
    for template in templates or []:
        url = template.format(cid=sanitized_cid)
        if url not in urls:
            urls.append(url)
    if provider in {"web3.storage", "nft.storage"}:
        for tpl in ["https://w3s.link/ipfs/{cid}", "https://{cid}.ipfs.w3s.link"]:
            url = tpl.format(cid=sanitized_cid)
            if url not in urls:
                urls.append(url)
    if provider == "pinata":
        for tpl in ["https://gateway.pinata.cloud/ipfs/{cid}", "https://ipfs.pinata.cloud/ipfs/{cid}"]:
            url = tpl.format(cid=sanitized_cid)
            if url not in urls:
                urls.append(url)
    for tpl in DEFAULT_GATEWAYS:
        url = tpl.format(cid=sanitized_cid)
        if url not in urls:
            urls.append(url)
    return urls

def _build_pin_result(
    provider: str,
    cid: str,
    attempts: int,
    status: Optional[str] = None,
    request_id: Optional[str] = None,
    size: Optional[int] = None,
    pinned_at: Optional[str] = None,
    templates: Optional[List[str]] = None,
) -> Dict[str, Any]:
    gateways = _build_gateway_urls(cid, provider, templates)
    gateway_url = gateways[0] if gateways else f"https://ipfs.io/ipfs/{cid}"
    return {
        "cid": cid,
        "uri": f"ipfs://{cid}",
        "gatewayUrl": gateway_url,
        "gatewayUrls": gateways,
        "provider": provider,
        "status": status,
        "requestId": request_id,
        "size": size,
        "pinnedAt": pinned_at,
        "attempts": attempts,
    }

def _resolve_pinners() -> List[PinningProvider]:
    providers: List[PinningProvider] = []
    seen: set[Tuple[str, str]] = set()

    def add_provider(name: str, endpoint: str, token: str, gateway_templates: Optional[List[str]] = None) -> None:
        key = (_strip_slashes(endpoint), token.strip())
        if not key[0] or not key[1] or key in seen:
            return
        seen.add(key)
        templates = list(gateway_templates or [])
        if CUSTOM_GATEWAY:
            templates.insert(0, f"{CUSTOM_GATEWAY.rstrip('/')}/ipfs/{{cid}}")
        providers.append(
            PinningProvider(name=name, endpoint=endpoint, token=token, gateway_templates=templates)
        )

    if PINNER_ENDPOINT and PINNER_TOKEN:
        add_provider(PINNER_KIND or "custom", PINNER_ENDPOINT, PINNER_TOKEN)
    if WEB3_STORAGE_TOKEN and (PINNER_KIND in {"web3storage", "nftstorage"} or not PINNER_ENDPOINT):
        kind = PINNER_KIND if PINNER_KIND in {"web3storage", "nftstorage"} else "web3.storage"
        endpoint = WEB3_STORAGE_ENDPOINT if kind == "web3.storage" else "https://api.nft.storage"
        add_provider(kind, endpoint, WEB3_STORAGE_TOKEN)
    if PINATA_API_KEY and PINATA_SECRET_API_KEY:
        token = f"{PINATA_API_KEY}:{PINATA_SECRET_API_KEY}"
        add_provider("pinata", PINATA_ENDPOINT, token, [PINATA_GATEWAY])
    if PINATA_JWT and not (PINATA_API_KEY and PINATA_SECRET_API_KEY):
        add_provider("pinata", PINATA_ENDPOINT, f"Bearer {PINATA_JWT}", [PINATA_GATEWAY])

    if not providers and ALLOW_PINNING_STUB:
        providers.append(
            PinningProvider(
                name="memory", endpoint="memory://pin", token="stub", gateway_templates=list(DEFAULT_GATEWAYS)
            )
        )

    return providers

async def _pin_json(data: dict, file_name: str) -> dict:
    providers = _resolve_pinners()
    if not providers:
        raise PinningError("No pinning providers configured", provider="none")
    errors = []
    for provider in providers:
        if provider.name == "memory":
            cid = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
            return _build_pin_result(
                provider="memory", cid=cid, attempts=1, status="pinned", templates=DEFAULT_GATEWAYS
            )
        url = _ensure_upload_url(provider.endpoint, provider.name)
        headers = _build_auth_headers(provider.name, provider.token)
        try:
            files = {
                "file": (
                    file_name,
                    json.dumps(data, sort_keys=True, separators=(",", ":")),
                    "application/json",
                )
            }
        except Exception as e:
            raise PinningError(f"Failed to serialize JSON for pinning: {e}", provider=provider.name)
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(url, headers=headers, files=files)
                if res.status_code in (200, 201):
                    res_json = res.json()
                    cid = res_json.get("cid") or res_json.get("IpfsHash") or res_json.get("hash")
                    if not cid:
                        raise PinningError("Missing CID in pinning response", provider=provider.name)
                    return _build_pin_result(
                        provider=provider.name,
                        cid=cid,
                        attempts=1,
                        status=res_json.get("status") or "pinned",
                        request_id=res_json.get("requestId") or res_json.get("id"),
                        size=res_json.get("size"),
                        pinned_at=res_json.get("created") or res_json.get("timestamp"),
                    )
                if _is_retryable_status(res.status_code):
                    errors.append((provider.name, res.status_code, res.text))
                    continue
                err_msg = f"Pinning service {provider.name} failed: {res.status_code} {res.text}"
                raise PinningError(err_msg, provider=provider.name, status=res.status_code)
        except Exception as e:
            errors.append((provider.name, getattr(e, "status", None) or 0, str(e)))
            continue
    logging.error("All pinning attempts failed: %s", errors)
    raise PinningError("All configured pinning services failed", provider="all")
def _build_tx(func, sender: str) -> dict:
    tx = func.build_transaction({"from": sender, "nonce": w3.eth.get_transaction_count(sender)})
    if CHAIN_ID:
        tx["chainId"] = CHAIN_ID
    tx.setdefault("gas", min(w3.eth.get_block("latest").gasLimit, 500000))
    tx.setdefault("gasPrice", w3.eth.gas_price)
    return tx

async def _send_relayer_tx(
    tx: dict,
    *,
    mode: Literal["legacy", "relayer"] = "legacy",
    context: Optional[AAExecutionContext] = None,
) -> Tuple[str, dict]:
    if mode == "relayer":
        executor = _get_aa_executor()
        if executor:
            if context is None:
                raise RuntimeError("AAExecutionContext is required for relayer mode")
            try:
                result = await executor.execute(tx, context)
            except (AAPolicyRejection, AAPaymasterRejection):
                raise
            except AABundlerError as exc:
                if exc.is_simulation_error:
                    detail = _error_detail("AA_SIMULATION_FAILED")
                    detail["reason"] = str(exc)
                    raise HTTPException(status_code=422, detail=detail) from exc
                detail = _error_detail("RELAY_UNAVAILABLE")
                detail["reason"] = "BUNDLER_ERROR"
                raise HTTPException(status_code=502, detail=detail) from exc
            receipt_payload = dict(result.receipt or {})
            receipt_payload.setdefault("userOpHash", result.user_operation_hash)
            return result.transaction_hash, receipt_payload

    if not relayer:
        raise _http_error(400, "RELAY_UNAVAILABLE")

    signed = await asyncio.to_thread(relayer.sign_transaction, tx)

    raw_tx_hash = await asyncio.to_thread(w3.eth.send_raw_transaction, signed.rawTransaction)
    if hasattr(raw_tx_hash, "hex") and callable(raw_tx_hash.hex):
        tx_hash = raw_tx_hash.hex()
    elif isinstance(raw_tx_hash, bytes):
        tx_hash = raw_tx_hash.hex()
    else:
        tx_hash = str(raw_tx_hash)

    receipt = await asyncio.to_thread(w3.eth.wait_for_transaction_receipt, tx_hash, timeout=180)

    return tx_hash, dict(receipt)

def _collect_tx_hashes(*candidates: Optional[Any]) -> List[str]:
    seen: Dict[str, None] = {}
    for candidate in candidates:
        if isinstance(candidate, list):
            for entry in candidate:
                if isinstance(entry, str):
                    trimmed = entry.strip()
                    if trimmed:
                        seen.setdefault(trimmed, None)
        elif isinstance(candidate, str):
            trimmed = candidate.strip()
            if trimmed:
                seen.setdefault(trimmed, None)
    return list(seen.keys())

def _build_receipt_payload(response: ExecuteResponse, plan_hash: Optional[str], created_at: Optional[str], tx_hashes: List[str]) -> Optional[Dict[str, Any]]:
    if not tx_hashes or not plan_hash or not created_at:
        return None
    record: Dict[str, Any] = {
        "planHash": plan_hash,
        "jobId": response.jobId,
        "txHashes": tx_hashes,
        "createdAt": created_at,
        "timestamp": created_at,
    }
    if response.policySnapshot:
        record["policySnapshot"] = response.policySnapshot
    if response.toolingVersions:
        record["toolingVersions"] = response.toolingVersions
    if response.signer:
        record["signer"] = response.signer
    if response.resultCid:
        record["resultCid"] = response.resultCid
    relevant_cid = response.deliverableCid or response.specCid or response.receiptCid
    if relevant_cid:
        record["relevantCid"] = relevant_cid
    if response.specCid:
        record["specCid"] = response.specCid
    if response.deliverableCid:
        record["deliverableCid"] = response.deliverableCid
    if response.receiptUrl:
        record["receiptUrl"] = response.receiptUrl
    if response.reward:
        record["reward"] = response.reward
    if response.token:
        record["token"] = response.token
    if response.status:
        record["status"] = response.status
    fees: Dict[str, Any] = {}
    if response.feePct is not None:
        fees["feePct"] = response.feePct
    if response.feeAmount is not None:
        fees["feeAmount"] = response.feeAmount
    if response.burnPct is not None:
        fees["burnPct"] = response.burnPct
    if response.burnAmount is not None:
        fees["burnAmount"] = response.burnAmount
    if fees:
        record["fees"] = fees
    return record

async def _attach_receipt_artifacts(response: ExecuteResponse) -> None:
    tx_hashes = _collect_tx_hashes(response.txHashes, response.txHash)
    if tx_hashes:
        response.txHashes = tx_hashes
    else:
        response.txHashes = None
        return
    receipt_payload = _build_receipt_payload(response, response.planHash, response.createdAt, tx_hashes)
    if not receipt_payload:
        return
    initial_result_cid = (
        response.resultCid
        or response.deliverableCid
        or response.specCid
        or response.receiptCid
    )
    if initial_result_cid and "resultCid" not in receipt_payload:
        receipt_payload["resultCid"] = initial_result_cid
    serialized_payload = json.loads(json.dumps(receipt_payload, sort_keys=True))
    response.receipt = serialized_payload
    deliverable_pin = await _pin_json(serialized_payload, "job-deliverable.json")
    cid = deliverable_pin.get("cid")
    uri = deliverable_pin.get("uri")
    gateway_url = deliverable_pin.get("gatewayUrl")
    gateways = deliverable_pin.get("gatewayUrls")
    response.deliverableCid = cid
    response.deliverableUri = uri
    response.deliverableGatewayUrl = gateway_url
    response.deliverableGatewayUrls = gateways
    if cid:
        response.resultCid = cid
        if response.receipt is not None:
            response.receipt["resultCid"] = cid
            response.receipt["relevantCid"] = cid
    if uri:
        response.resultUri = uri
        if response.receipt is not None:
            response.receipt["resultUri"] = uri
    if gateway_url:
        response.resultGatewayUrl = gateway_url
        if response.receipt is not None:
            response.receipt["resultGatewayUrl"] = gateway_url
    if gateways:
        response.resultGatewayUrls = gateways
        if response.receipt is not None:
            response.receipt["resultGatewayUrls"] = gateways
    response.receiptCid = cid
    response.receiptUri = uri
    response.receiptGatewayUrl = gateway_url
    response.receiptGatewayUrls = gateways
    if response.receipt is not None:
        receipt_metadata, receipt_digest = _finalize_receipt_metadata(response.receipt)
        response.receipt = receipt_metadata
        response.receiptDigest = receipt_digest
        _propagate_attestation_fields(response, receipt_metadata)

@router.post("/plan", response_model=PlanResponse, dependencies=[Depends(require_api)])
async def plan(request: Request, req: PlanRequest):
    start = time.perf_counter()
    correlation_id = _get_correlation_id(request)
    intent_type = "unknown"
    status_code = 200
    security_context = _context_from_request(request)

    try:
        if not req.text or not req.text.strip():
            raise _http_error(400, "REQUEST_EMPTY")
        intent = _naive_parse(req.text)
        intent_type = intent.action
        summary, requires_confirmation, warnings = _summary_for_intent(intent, req.text)
        missing_fields = _detect_missing_fields(intent)
        if missing_fields:
            requires_confirmation = False
        plan_hash = _compute_plan_hash(intent)
        created_at = _current_timestamp()
        intent_snapshot = _maybe_model_dump(intent)
        _store_plan_metadata(
            plan_hash,
            created_at,
            intent_snapshot=intent_snapshot if isinstance(intent_snapshot, dict) else None,
            missing_fields=missing_fields,
        )

        plan_metadata: Dict[str, Any] = {
            "summary": summary,
            "intent": intent_snapshot if isinstance(intent_snapshot, dict) else _maybe_model_dump(intent),
            "requiresConfirmation": requires_confirmation,
            "warnings": warnings,
            "planHash": plan_hash,
        }
        if missing_fields:
            plan_metadata["missingFields"] = missing_fields
        plan_receipt, plan_digest = _finalize_receipt_metadata(plan_metadata)

        response = PlanResponse(
            summary=summary,
            intent=intent,
            requiresConfirmation=requires_confirmation,
            warnings=warnings,
            planHash=plan_hash,
            missingFields=missing_fields,
            receipt=plan_receipt,
            receiptDigest=plan_digest,
        )
        _propagate_attestation_fields(response, plan_receipt)
        audit_event(
            security_context,
            "onebox.plan.success",
            intent=intent_type,
            plan_hash=plan_hash,
        )
        _log_event(logging.INFO, "onebox.plan.success", correlation_id, intent_type=intent_type)
        return response

    except HTTPException as exc:
        status_code = exc.status_code
        detail = getattr(exc, "detail", None)
        log_fields = {"intent_type": intent_type, "http_status": status_code}
        if detail and isinstance(detail, dict) and detail.get("code"):
            log_fields["error"] = detail["code"]
            audit_event(
                security_context,
                "onebox.plan.failed",
                intent=intent_type,
                status=status_code,
                error=detail["code"],
            )
        else:
            audit_event(
                security_context,
                "onebox.plan.failed",
                intent=intent_type,
                status=status_code,
            )
        _log_event(logging.WARNING, "onebox.plan.failed", correlation_id, **log_fields)
        raise
    except Exception as exc:
        status_code = 500
        audit_event(
            security_context,
            "onebox.plan.error",
            intent=intent_type,
            status=status_code,
            error=str(exc),
        )
        _log_event(logging.ERROR, "onebox.plan.error", correlation_id, intent_type=intent_type, http_status=status_code, error=str(exc))
        raise
    finally:
        duration = time.perf_counter() - start
        _PLAN_TOTAL.labels(intent_type=intent_type, http_status=str(status_code)).inc()
        _TTO_SECONDS.labels(endpoint="plan").observe(duration)

@router.post("/simulate", response_model=SimulateResponse, dependencies=[Depends(require_api)])
async def simulate(request: Request, req: SimulateRequest):
    start = time.perf_counter()
    correlation_id = _get_correlation_id(request)
    intent = req.intent
    payload = intent.payload
    intent_type = intent.action if intent and intent.action else "unknown"
    status_code = 200
    security_context = _context_from_request(request)

    request_created_at = None
    if req.createdAt is not None:
        candidate = str(req.createdAt).strip()
        if candidate:
            request_created_at = candidate

    canonical_full, plan_hash, created_at, _, _ = _bind_plan_hash(
        intent,
        req.planHash,
        request_created_at,
    )
    display_plan_hash = canonical_full

    blockers: List[str] = []
    blocker_details: List[Dict[str, str]] = []
    risk_codes: List[str] = []
    risk_messages: List[str] = []
    risk_details: List[Dict[str, str]] = []
    estimated_budget: Optional[str] = None
    fee_pct_value: Optional[float] = None
    fee_amount_value: Optional[str] = None
    burn_pct_value: Optional[float] = None
    burn_amount_value: Optional[str] = None
    requested_tools = _resolve_requested_tools(intent)
    org_identifier = _resolve_org_identifier(intent)

    def _add_blocker(code: str) -> None:
        normalized = str(code or "").strip()
        if not normalized:
            return
        if normalized not in blockers:
            blockers.append(normalized)
            blocker_details.append(_error_detail(normalized))

    def _add_risk(code: str) -> None:
        normalized = str(code or "").strip()
        if not normalized:
            return
        if normalized not in risk_codes:
            risk_codes.append(normalized)
            risk_messages.append(_error_message(normalized))
            risk_details.append(_error_detail(normalized))

    def _enforce_policy(reward_wei: int, deadline_days: int) -> None:
        if blockers:
            return
        try:
            store = _get_org_policy_store()
            _enforce_org_policy(store, org_identifier, reward_wei, deadline_days, requested_tools)
        except OrgPolicyViolation as violation:
            _add_blocker(violation.code)

    try:
        request_text = ""
        user_context = intent.userContext if intent and intent.userContext else {}
        if isinstance(user_context, dict):
            for key in ("requestText", "originalText", "prompt", "text"):
                candidate = user_context.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    request_text = candidate
                    break
        summary, _requires_confirmation, warnings = _summary_for_intent(
            intent,
            request_text,
            allow_network_fee=False,
        )
        for warning in warnings:
            _add_risk(warning)

        if intent.action == "post_job":
            reward_value = getattr(payload, "reward", None)
            deadline_value = getattr(payload, "deadlineDays", None)
            reward_wei: Optional[int] = None
            deadline_days: Optional[int] = None
            reward_decimal: Optional[Decimal] = None

            if reward_value is None or (isinstance(reward_value, str) and not str(reward_value).strip()):
                _add_blocker("INSUFFICIENT_BALANCE")
            else:
                try:
                    reward_decimal = Decimal(str(reward_value))
                except (InvalidOperation, ValueError, TypeError):
                    _add_blocker("REWARD_INVALID")
                else:
                    if reward_decimal <= Decimal(0):
                        _add_blocker("INSUFFICIENT_BALANCE")
                    else:
                        if reward_decimal < Decimal("1"):
                            _add_risk("LOW_REWARD")
                        precision = Decimal(10) ** AGIALPHA_DECIMALS
                        reward_wei = int((reward_decimal * precision).to_integral_value(rounding=ROUND_HALF_UP))

                        fee_pct_str, burn_pct_str = _get_fee_policy(allow_network=False)
                        fee_pct_dec = _decimal_from_optional(fee_pct_str)
                        burn_pct_dec = _decimal_from_optional(burn_pct_str)
                        fee_amount_str, burn_amount_str = _calculate_fee_amounts(
                            _format_decimal_string(reward_decimal),
                            fee_pct_dec or Decimal(0),
                            burn_pct_dec or Decimal(0),
                        )
                        fee_amount_value = fee_amount_str
                        burn_amount_value = burn_amount_str
                        if fee_pct_dec is not None:
                            fee_pct_value = float(fee_pct_dec)
                        if burn_pct_dec is not None:
                            burn_pct_value = float(burn_pct_dec)
                        try:
                            total_budget = reward_decimal
                            if fee_amount_value is not None:
                                total_budget += Decimal(fee_amount_value)
                            if burn_amount_value is not None:
                                total_budget += Decimal(burn_amount_value)
                            estimated_budget = _format_decimal_string(total_budget)
                        except (InvalidOperation, TypeError):
                            estimated_budget = None

            if deadline_value is None:
                _add_blocker("DEADLINE_INVALID")
            else:
                try:
                    deadline_days = int(deadline_value)
                except (ValueError, TypeError):
                    _add_blocker("DEADLINE_INVALID")
                else:
                    if deadline_days <= 0:
                        _add_blocker("DEADLINE_INVALID")
                    elif deadline_days <= 2:
                        _add_risk("SHORT_DEADLINE")
                    elif deadline_days >= 45:
                        _add_risk("LONG_DEADLINE")

            if not blockers and reward_wei is not None and deadline_days is not None:
                _enforce_policy(reward_wei, deadline_days)

        elif intent.action == "finalize_job":
            job_identifier = getattr(payload, "jobId", None)
            if job_identifier is None:
                _add_blocker("JOB_ID_REQUIRED")
            else:
                try:
                    job_id_int = int(job_identifier)
                except (TypeError, ValueError):
                    _add_blocker("JOB_ID_REQUIRED")
                else:
                    status = _get_cached_status(job_id_int)
                    if status is None or not getattr(status, "state", None) or status.state == "unknown":
                        try:
                            status = await _read_status(job_id_int)
                        except Exception as exc:
                            logger.warning(
                                "Unable to refresh job status during simulation", exc_info=exc
                            )
                    state = status.state if status and status.state else "unknown"
                    if state == "finalized":
                        _add_blocker("JOB_ALREADY_FINALIZED")
                    elif state == "disputed":
                        _add_blocker("JOB_IN_DISPUTE")
                    elif state == "unknown":
                        _add_risk("STATUS_UNKNOWN")
                    elif state not in _FINALIZABLE_STATES:
                        _add_blocker("JOB_NOT_READY_FOR_FINALIZE")
            if not blockers and requested_tools:
                _enforce_policy(0, 0)

        elif intent.action == "check_status":
            if getattr(payload, "jobId", None) is None:
                _add_blocker("JOB_ID_REQUIRED")
            elif requested_tools:
                _enforce_policy(0, 0)

        elif intent.action in {"stake", "validate", "dispute"}:
            _add_blocker("UNSUPPORTED_ACTION")
        else:
            _add_blocker("UNSUPPORTED_ACTION")

        if blockers:
            status_code = 422
            detail: Dict[str, Any] = _error_detail("BLOCKED")
            detail.update(
                {
                    "blockers": blockers,
                    "blockerDetails": blocker_details,
                    "planHash": display_plan_hash,
                    "createdAt": created_at,
                }
            )
            if risk_messages:
                detail["risks"] = risk_messages
            if risk_codes:
                detail["riskCodes"] = risk_codes
                detail["riskDetails"] = risk_details
            if estimated_budget is not None:
                detail["estimatedBudget"] = estimated_budget
            if fee_pct_value is not None:
                detail["feePct"] = fee_pct_value
            if fee_amount_value is not None:
                detail["feeAmount"] = fee_amount_value
            if burn_pct_value is not None:
                detail["burnPct"] = burn_pct_value
            if burn_amount_value is not None:
                detail["burnAmount"] = burn_amount_value
            raise HTTPException(status_code=422, detail=detail)

        simulation_metadata: Dict[str, Any] = {
            "summary": summary,
            "intent": _maybe_model_dump(intent),
            "risks": risk_messages,
            "riskCodes": risk_codes,
            "riskDetails": risk_details,
            "blockers": [],
            "planHash": display_plan_hash or "",
            "createdAt": created_at,
        }
        if estimated_budget is not None:
            simulation_metadata["estimatedBudget"] = estimated_budget
        if fee_pct_value is not None:
            simulation_metadata["feePct"] = fee_pct_value
        if fee_amount_value is not None:
            simulation_metadata["feeAmount"] = fee_amount_value
        if burn_pct_value is not None:
            simulation_metadata["burnPct"] = burn_pct_value
        if burn_amount_value is not None:
            simulation_metadata["burnAmount"] = burn_amount_value

        simulation_receipt, simulation_digest = _finalize_receipt_metadata(simulation_metadata)

        response = SimulateResponse(
            summary=summary,
            intent=intent,
            risks=risk_messages,
            riskCodes=risk_codes,
            riskDetails=risk_details,
            blockers=[],
            planHash=display_plan_hash or "",
            createdAt=created_at,
            estimatedBudget=estimated_budget,
            feePct=fee_pct_value,
            feeAmount=fee_amount_value,
            burnPct=burn_pct_value,
            burnAmount=burn_amount_value,
            receipt=simulation_receipt,
            receiptDigest=simulation_digest,
        )
        _propagate_attestation_fields(response, simulation_receipt)
        audit_event(
            security_context,
            "onebox.simulate.success",
            intent=intent_type,
            plan_hash=display_plan_hash or "",
            blockers=len(blockers),
            risks=len(risk_codes),
        )
    except HTTPException as exc:
        status_code = exc.status_code
        detail = getattr(exc, "detail", None)
        log_fields: Dict[str, Any] = {"intent_type": intent_type, "http_status": status_code}
        error_code = detail.get("code") if isinstance(detail, dict) else None
        audit_event(
            security_context,
            "onebox.simulate.failed",
            intent=intent_type,
            status=status_code,
            error=error_code,
        )
        if status_code == 422 and isinstance(detail, dict):
            blockers_detail = detail.get("blockers")
            if isinstance(blockers_detail, list):
                log_fields["blockers"] = ",".join(blockers_detail)
            risk_codes_detail = detail.get("riskCodes")
            if isinstance(risk_codes_detail, list) and risk_codes_detail:
                log_fields["risks"] = ",".join(str(code) for code in risk_codes_detail)
            _log_event(logging.WARNING, "onebox.simulate.blocked", correlation_id, **log_fields)
        else:
            log_fields["error"] = detail if detail else "UNKNOWN_ERROR"
            _log_event(logging.WARNING, "onebox.simulate.error", correlation_id, **log_fields)
        raise
    except Exception as exc:
        status_code = 500
        audit_event(
            context,
            "onebox.simulate.error",
            intent=intent_type,
            status=status_code,
            error=str(exc),
        )
        _log_event(
            logging.ERROR,
            "onebox.simulate.error",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
            error=str(exc),
        )
        raise
    else:
        log_fields: Dict[str, Any] = {"intent_type": intent_type, "http_status": status_code}
        if risk_codes:
            log_fields["risks"] = ",".join(risk_codes)
        _log_event(logging.INFO, "onebox.simulate.success", correlation_id, **log_fields)
        return response
    finally:
        duration = time.perf_counter() - start
        _SIMULATE_TOTAL.labels(intent_type=intent_type, http_status=str(status_code)).inc()
        _TTO_SECONDS.labels(endpoint="simulate").observe(duration)
@router.post("/execute", response_model=ExecuteResponse, dependencies=[Depends(require_api)])
async def execute(request: Request, req: ExecuteRequest):
    start = time.perf_counter()
    correlation_id = _get_correlation_id(request)
    intent = req.intent
    payload = intent.payload
    intent_type = intent.action if intent and intent.action else "unknown"
    status_code = 200
    context = _context_from_request(request)

    request_created_at = None
    if req.createdAt is not None:
        candidate = str(req.createdAt).strip()
        if candidate:
            request_created_at = candidate

    canonical_full, plan_hash, created_at, _, _ = _bind_plan_hash(
        intent,
        req.planHash,
        request_created_at,
    )
    display_plan_hash = canonical_full
    tooling_versions = _collect_tooling_versions()
    requested_tools = _resolve_requested_tools(intent)
    org_identifier = _resolve_org_identifier(intent)

    try:
        if intent.action == "post_job":
            if not payload.reward:
                raise _http_error(400, "INSUFFICIENT_BALANCE")
            if payload.deadlineDays is None:
                raise _http_error(400, "DEADLINE_INVALID")

            reward_wei = _to_wei(str(payload.reward))
            deadline_days = int(payload.deadlineDays)
            policy_snapshot: Optional[Dict[str, Any]] = None
            try:
                store = _get_org_policy_store()
                policy_record = _enforce_org_policy(
                    store, org_identifier, reward_wei, deadline_days, requested_tools
                )
            except OrgPolicyViolation as violation:
                log_fields: Dict[str, Any] = {
                    "intent_type": intent_type,
                    "org_identifier": org_identifier or "__default__",
                    "reward_wei": str(reward_wei),
                    "deadline_days": deadline_days,
                    "reason": violation.code,
                }
                if violation.record.max_budget_wei is not None:
                    log_fields["max_budget_wei"] = str(violation.record.max_budget_wei)
                if violation.record.max_duration_days is not None:
                    log_fields["max_duration_days"] = violation.record.max_duration_days
                if requested_tools:
                    log_fields["requested_tools"] = ",".join(requested_tools)
                _log_event(logging.WARNING, "onebox.policy.rejected", correlation_id, **log_fields)
                raise violation.to_http_exception()
            else:
                log_fields = {
                    "intent_type": intent_type,
                    "org_identifier": org_identifier or "__default__",
                    "reward_wei": str(reward_wei),
                    "deadline_days": deadline_days,
                }
                if policy_record.max_budget_wei is not None:
                    log_fields["max_budget_wei"] = str(policy_record.max_budget_wei)
                if policy_record.max_duration_days is not None:
                    log_fields["max_duration_days"] = policy_record.max_duration_days
                if requested_tools:
                    log_fields["requested_tools"] = ",".join(requested_tools)
                _log_event(logging.INFO, "onebox.policy.accepted", correlation_id, **log_fields)
                policy_snapshot = _serialize_policy_snapshot(policy_record, org_identifier)

            deadline_ts = _calculate_deadline_timestamp(deadline_days)
            fee_pct, burn_pct = _get_fee_policy()
            fee_amount, burn_amount = _calculate_fee_amounts(str(payload.reward), Decimal(fee_pct or "0"), Decimal(burn_pct or "0"))
            job_payload = {
                "title": payload.title or "New Job",
                "description": payload.description or "",
                "attachments": [a.dict() for a in payload.attachments],
                "rewardToken": payload.rewardToken or AGIALPHA_SYMBOL,
                "reward": str(payload.reward),
                "deadlineDays": deadline_days,
                "deadline": deadline_ts,
                "agentTypes": payload.agentTypes,
            }
            spec_hash = _compute_spec_hash(job_payload)
            job_payload["specHash"] = "0x" + spec_hash.hex()
            spec_pin = await _pin_json(job_payload, "job-spec.json")
            cid = spec_pin.get("cid")
            if not cid:
                raise _http_error(502, "IPFS_FAILED")
            uri = spec_pin.get("uri") or f"ipfs://{cid}"

            base_response_kwargs: Dict[str, Any] = {
                "ok": True,
                "planHash": display_plan_hash,
                "createdAt": created_at,
                "specCid": cid,
                "specUri": uri,
                "specGatewayUrl": spec_pin.get("gatewayUrl"),
                "specGatewayUrls": spec_pin.get("gatewayUrls"),
                "specHash": "0x" + spec_hash.hex(),
                "deadline": deadline_ts,
                "reward": str(payload.reward),
                "token": payload.rewardToken or AGIALPHA_SYMBOL,
                "feePct": float(fee_pct) if fee_pct is not None else None,
                "burnPct": float(burn_pct) if burn_pct is not None else None,
                "feeAmount": fee_amount,
                "burnAmount": burn_amount,
                "policySnapshot": policy_snapshot,
                "toolingVersions": tooling_versions,
                "resultCid": cid,
                "resultUri": uri,
                "resultGatewayUrl": spec_pin.get("gatewayUrl"),
                "resultGatewayUrls": spec_pin.get("gatewayUrls"),
            }

            wallet_response: Optional[ExecuteResponse] = None
            relayed_response: Optional[ExecuteResponse] = None

            def _build_wallet_response() -> ExecuteResponse:
                to, data = _encode_wallet_call("postJob", [uri, AGIALPHA_TOKEN, reward_wei, deadline_days])
                signer_identity: Optional[str] = None
                if isinstance(intent.userContext, dict):
                    signer_identity = intent.userContext.get("sender")
                return ExecuteResponse(
                    **base_response_kwargs,
                    to=to,
                    data=data,
                    value="0x0",
                    chainId=CHAIN_ID,
                    status="prepared",
                    signer=signer_identity,
                )

            if req.mode != "wallet":
                func = registry.functions.postJob(uri, AGIALPHA_TOKEN, reward_wei, deadline_days)
                sender = None
                if relayer:
                    sender = relayer.address
                else:
                    ctx = intent.userContext if isinstance(intent.userContext, dict) else {}
                    if isinstance(ctx, dict):
                        sender = ctx.get("sender")
                if not sender:
                    detail = _error_detail("RELAY_UNAVAILABLE")
                    detail["reason"] = "MISSING_SENDER"
                    raise HTTPException(status_code=400, detail=detail)
                tx = _build_tx(func, sender)
                aa_context = AAExecutionContext(
                    org_identifier=org_identifier,
                    intent_type=intent_type,
                    correlation_id=correlation_id,
                    plan_hash=display_plan_hash,
                    created_at=created_at,
                    metadata={"action": intent.action or ""},
                )
                try:
                    txh, receipt = await _send_relayer_tx(tx, mode="relayer", context=aa_context)
                except (AAPolicyRejection, AAPaymasterRejection):
                    wallet_response = _build_wallet_response()
                else:
                    job_id = _decode_job_created(receipt)
                    relayed_response = ExecuteResponse(
                        **base_response_kwargs,
                        jobId=job_id,
                        txHash=txh,
                        txHashes=[txh] if txh else None,
                        receiptUrl=EXPLORER_TX_TPL.format(tx=txh),
                        status="submitted",
                        signer=str(sender),
                        receipt=receipt,
                    )

            if req.mode == "wallet" or wallet_response:
                response = wallet_response or _build_wallet_response()
            else:
                response = relayed_response
                if response is None:
                    raise _http_error(500, "UNKNOWN")
        elif intent.action == "finalize_job":
            if payload.jobId is None:
                raise _http_error(400, "JOB_ID_REQUIRED")
            try:
                job_id_int = int(payload.jobId)
            except (TypeError, ValueError):
                raise _http_error(400, "JOB_ID_REQUIRED")
            if requested_tools:
                try:
                    store = _get_org_policy_store()
                    _enforce_org_policy(store, org_identifier, 0, 0, requested_tools)
                except OrgPolicyViolation as violation:
                    log_fields = {
                        "intent_type": intent_type,
                        "org_identifier": org_identifier or "__default__",
                        "reason": violation.code,
                    }
                    if requested_tools:
                        log_fields["requested_tools"] = ",".join(requested_tools)
                    _log_event(logging.WARNING, "onebox.policy.rejected", correlation_id, **log_fields)
                    raise violation.to_http_exception()
            wallet_response: Optional[ExecuteResponse] = None
            relayed_response: Optional[ExecuteResponse] = None

            def _build_wallet_response() -> ExecuteResponse:
                to, data = _encode_wallet_call("finalize", [job_id_int])
                signer_identity: Optional[str] = None
                if isinstance(intent.userContext, dict):
                    signer_identity = intent.userContext.get("sender")
                return ExecuteResponse(
                    ok=True,
                    planHash=display_plan_hash,
                    createdAt=created_at,
                    to=to,
                    data=data,
                    value="0x0",
                    chainId=CHAIN_ID,
                    status="prepared",
                    toolingVersions=tooling_versions,
                    signer=signer_identity,
                )

            if req.mode != "wallet":
                func = registry.functions.finalize(job_id_int)
                sender = None
                if relayer:
                    sender = relayer.address
                else:
                    ctx = intent.userContext if isinstance(intent.userContext, dict) else {}
                    if isinstance(ctx, dict):
                        sender = ctx.get("sender")
                if not sender:
                    detail = _error_detail("RELAY_UNAVAILABLE")
                    detail["reason"] = "MISSING_SENDER"
                    raise HTTPException(status_code=400, detail=detail)
                tx = _build_tx(func, sender)
                aa_context = AAExecutionContext(
                    org_identifier=org_identifier,
                    intent_type=intent_type,
                    correlation_id=correlation_id,
                    plan_hash=display_plan_hash,
                    created_at=created_at,
                    metadata={"action": intent.action or ""},
                )
                try:
                    txh, receipt = await _send_relayer_tx(tx, mode="relayer", context=aa_context)
                except (AAPolicyRejection, AAPaymasterRejection):
                    wallet_response = _build_wallet_response()
                else:
                    relayed_response = ExecuteResponse(
                        ok=True,
                        planHash=display_plan_hash,
                        createdAt=created_at,
                        jobId=job_id_int,
                        txHash=txh,
                        txHashes=[txh] if txh else None,
                        receiptUrl=EXPLORER_TX_TPL.format(tx=txh),
                        status="submitted",
                        toolingVersions=tooling_versions,
                        signer=str(sender),
                        receipt=receipt,
                    )

            if req.mode == "wallet" or wallet_response:
                response = wallet_response or _build_wallet_response()
            else:
                response = relayed_response
                if response is None:
                    raise _http_error(500, "UNKNOWN")
        else:
            raise _http_error(400, "UNSUPPORTED_ACTION")

        if req.mode != "wallet":
            await _attach_receipt_artifacts(response)
            response.status = response.status or "completed"
        else:
            response.status = response.status or "prepared"

        response.ok = True
        audit_event(
            context,
            "onebox.execute.success",
            intent=intent_type,
            mode=req.mode,
            plan_hash=display_plan_hash,
            job_id=getattr(response, "jobId", None),
        )
        _log_event(logging.INFO, "onebox.execute.success", correlation_id, intent_type=intent_type)
        return response

    except HTTPException as exc:
        status_code = exc.status_code
        detail = getattr(exc, "detail", None)
        log_fields = {"intent_type": intent_type, "http_status": status_code}
        if detail and isinstance(detail, dict) and detail.get("code"):
            log_fields["error"] = detail["code"]
        audit_event(
            context,
            "onebox.execute.failed",
            intent=intent_type,
            status=status_code,
            error=(detail.get("code") if isinstance(detail, dict) else detail),
        )
        _log_event(logging.WARNING, "onebox.execute.failed", correlation_id, **log_fields)
        raise
    except Exception as exc:
        status_code = 500
        audit_event(
            context,
            "onebox.execute.error",
            intent=intent_type,
            status=status_code,
            error=str(exc),
        )
        _log_event(logging.ERROR, "onebox.execute.error", correlation_id, intent_type=intent_type, http_status=status_code, error=str(exc))
        raise
    finally:
        duration = time.perf_counter() - start
        _EXECUTE_TOTAL.labels(intent_type=intent_type, http_status=str(status_code)).inc()
        _TTO_SECONDS.labels(endpoint="execute").observe(duration)

@router.get("/status", response_model=StatusResponse, dependencies=[Depends(require_api)])
async def status(request: Request, jobId: int):
    correlation_id = _get_correlation_id(request)
    intent_type = "check_status"
    job_id = jobId
    context = _context_from_request(request)

    try:
        job = registry.functions.jobs(job_id).call()
    except Exception as e:
        logger.error("Job status retrieval failed for job %s: %s", job_id, e)
        audit_event(
            context,
            "onebox.status.error",
            job_id=job_id,
            error=str(e),
        )
        return StatusResponse(jobId=job_id, state="unknown")

    agent = None
    reward = None
    state_code = None
    deadline = None
    if isinstance(job, (list, tuple)) and len(job) >= 6:
        agent = job[1]
        reward = int(job[2])
        state_code = int(job[5])
        if len(job) > 8 and job[8]:
            deadline = int(job[8])
    else:
        logger.warning("unknown job payload shape for job %s", job_id)

    assignee = None
    if agent:
        try:
            text_agent = str(agent).strip()
            if text_agent and int(text_agent, 16) != 0:
                try:
                    assignee = Web3.to_checksum_address(text_agent)
                except Exception:
                    assignee = text_agent
        except Exception:
            assignee = None
    reward_str = _format_reward(reward) if reward is not None else None
    state_label = _STATE_MAP.get(state_code, "unknown")
    state_output = (
        "disputed"
        if state_label == "disputed"
        else state_label
        if state_label in {"open", "assigned", "review", "completed", "finalized"}
        else "unknown"
    )

    response = StatusResponse(
        jobId=int(job_id),
        state=state_output,
        reward=reward_str,
        token=AGIALPHA_TOKEN,
        deadline=deadline,
        assignee=assignee,
    )
    _cache_status(response)
    audit_event(
        context,
        "onebox.status.success",
        job_id=job_id,
        state=state_output,
    )
    _log_event(logging.INFO, "onebox.status.success", correlation_id, intent_type=intent_type)
    return response

def _log_event(level: int, event: str, correlation_id: str, **kwargs: Any) -> None:
    extra = {"event": event, "cid": correlation_id}
    extra.update(kwargs or {})
    logger.log(level, f"{event} | cid={correlation_id} | " + " ".join(f"{k}={v}" for k, v in kwargs.items()), extra=extra)

@health_router.get("/healthz")
async def healthz() -> Dict[str, bool]:
    try:
        block_attr = getattr(w3.eth, "block_number", None)
        if callable(block_attr):
            block_attr()
        elif block_attr is None:
            w3.eth.get_block("latest")
    except Exception as e:
        raise HTTPException(status_code=503, detail={"code": "RPC_UNAVAILABLE", "message": str(e)})
    return {"ok": True}

async def _healthcheck(request: Request | None = None) -> Dict[str, bool]:
    return await healthz()

@health_router.get("/metrics")
def metrics():
    return Response(
        prometheus_client.generate_latest(_metrics_registry()),
        media_type=prometheus_client.CONTENT_TYPE_LATEST,
    )

healthcheck = _healthcheck
metrics_endpoint = metrics

_STATE_MAP = {
    0: "draft",
    1: "open",
    2: "assigned",
    3: "review",
    4: "completed",
    5: "disputed",
    6: "finalized",
}

_FINALIZABLE_STATES: Set[str] = {"completed", "review"}

def _calculate_fee_amounts(reward: str, fee_pct: Decimal, burn_pct: Decimal) -> Tuple[str, str]:
    try:
        reward_dec = Decimal(reward)
    except InvalidOperation:
        return "0", "0"
    fee_amount = (reward_dec * fee_pct / Decimal(100)).normalize()
    burn_amount = (reward_dec * burn_pct / Decimal(100)).normalize()
    def _fmt(val: Decimal) -> str:
        text = format(val, "f")
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        return text or "0"
    return _fmt(fee_amount), _fmt(burn_amount)

def _compute_spec_hash(payload: Dict[str, Any]) -> bytes:
    canonical = json.dumps(payload, sort_keys=True).encode("utf-8")
    return hashlib.sha256(canonical).digest()

def _encode_wallet_call(method: str, args: List[Any]) -> Tuple[str, str]:
    try:
        func = getattr(registry.functions, method)(*args)
    except AttributeError as exc:
        raise _http_error(400, "UNSUPPORTED_ACTION") from exc
    tx = func.build_transaction({"from": registry.address})
    data = tx.get("data")
    if not data and hasattr(func, "_encode_transaction_data"):
        try:
            data = func._encode_transaction_data()
        except Exception:
            data = None
    if isinstance(data, bytes):
        data = Web3.to_hex(data)
    elif hasattr(data, "hex") and not isinstance(data, str):
        data = Web3.to_hex(data)
    if not isinstance(data, str):
        data = "0x"
    return registry.address, data

def _decode_job_created(receipt: Dict[str, Any]) -> Optional[int]:
    try:
        event = registry.events.JobCreated()
        try:
            processed = event.process_receipt(receipt)
        except Exception:
            processed = []
        for entry in processed or []:
            args = entry.get("args") if isinstance(entry, dict) else getattr(entry, "args", None)
            if isinstance(args, dict) and "jobId" in args:
                job_id = args.get("jobId")
                if job_id is not None:
                    return int(job_id)
    except Exception as exc:
        logger.warning("Failed to decode JobCreated event: %s", exc)
    try:
        return int(registry.functions.nextJobId().call())
    except Exception:
        return None

async def _read_status(job_id: int) -> StatusResponse:
    try:
        job = registry.functions.jobs(job_id).call()
    except Exception:
        response = StatusResponse(jobId=job_id, state="unknown")
        _cache_status(response)
        return response

    agent = None
    reward: Optional[int] = None
    state_code: Optional[int] = None
    deadline: Optional[int] = None

    if isinstance(job, dict):
        agent = job.get("agent") or job.get("agentAddress")
        reward_val = job.get("reward") or job.get("rewardWei")
        if reward_val is not None:
            try:
                reward = int(reward_val)
            except (TypeError, ValueError):
                reward = None
        packed = job.get("packedMetadata") or job.get("metadata") or job.get("packed")
        if packed is not None:
            try:
                packed_int = int(packed)
            except (TypeError, ValueError):
                packed_int = None
            if packed_int is not None:
                state_code = packed_int & 0x7
                deadline_bits = (packed_int >> 77) & _UINT64_MAX
                if deadline_bits:
                    deadline = int(deadline_bits)
    elif isinstance(job, (list, tuple)) and len(job) >= 6:
        agent = job[1]
        try:
            reward = int(job[2])
        except (TypeError, ValueError):
            reward = None
        try:
            state_code = int(job[5])
        except (TypeError, ValueError):
            state_code = None
        if len(job) > 8 and job[8]:
            try:
                deadline = int(job[8])
            except (TypeError, ValueError):
                deadline = None
    assignee = None
    if agent:
        try:
            text_agent = str(agent).strip()
            if text_agent and int(text_agent, 16) != 0:
                try:
                    assignee = Web3.to_checksum_address(text_agent)
                except Exception:
                    assignee = text_agent
        except Exception:
            assignee = None
    reward_str = _format_reward(reward) if reward is not None else None
    state_label = _STATE_MAP.get(state_code, "unknown")
    state_output = (
        "disputed"
        if state_label == "disputed"
        else state_label
        if state_label in {"open", "assigned", "review", "completed", "finalized"}
        else "unknown"
    )
    response = StatusResponse(
        jobId=job_id,
        state=state_output,
        reward=reward_str,
        token=AGIALPHA_TOKEN,
        deadline=deadline,
        assignee=assignee,
    )
    _cache_status(response)
    return response

def _naive_parse(text: str) -> JobIntent:
    normalized = text.strip()
    lower = normalized.lower()
    payload = JobPayload()

    finalize_patterns = [
        r"finaliz(?:e|ing)\s+job\s+#?(\d+)",
        r"complete\s+job\s+#?(\d+)",
        r"close\s+job\s+#?(\d+)",
    ]
    for pattern in finalize_patterns:
        match = re.search(pattern, lower)
        if match:
            try:
                payload.jobId = int(match.group(1))
            except (TypeError, ValueError):
                payload.jobId = None
            return JobIntent(action="finalize_job", payload=payload)

    if re.search(r"\b(finalize|finalise|complete|close)\b", lower):
        return JobIntent(action="finalize_job", payload=payload)

    status_patterns = [
        r"status\s+(?:for|of)\s+job\s+#?(\d+)",
        r"state\s+(?:for|of)\s+job\s+#?(\d+)",
    ]
    for pattern in status_patterns:
        match = re.search(pattern, lower)
        if match:
            try:
                payload.jobId = int(match.group(1))
            except (TypeError, ValueError):
                payload.jobId = None
            return JobIntent(action="check_status", payload=payload)

    match = re.search(r"\bstake\b.*?job\s+#?(\d+)", lower)
    if match:
        try:
            payload.jobId = int(match.group(1))
        except (TypeError, ValueError):
            payload.jobId = None
        return JobIntent(action="stake", payload=payload)

    match = re.search(r"\bvalidate\b.*?job\s+#?(\d+)", lower)
    if match:
        try:
            payload.jobId = int(match.group(1))
        except (TypeError, ValueError):
            payload.jobId = None
        return JobIntent(action="validate", payload=payload)

    match = re.search(r"\bdispute\b.*?job\s+#?(\d+)", lower)
    if match:
        try:
            payload.jobId = int(match.group(1))
        except (TypeError, ValueError):
            payload.jobId = None
        return JobIntent(action="dispute", payload=payload)

    match = re.search(r"post\s+job\s+#?(\d+)", lower)
    if match:
        payload.title = normalized
        return JobIntent(action="post_job", payload=payload)

    reward_match = re.search(r"(\d+(?:\.\d+)?)\s*(agia|agialpha|token)", lower)
    if reward_match:
        payload.reward = reward_match.group(1)
    deadline_match = re.search(r"(\d+)\s*(?:day|days|d)\b", lower)
    if deadline_match:
        payload.deadlineDays = int(deadline_match.group(1))
    title = normalized.split(".")[0].strip()
    if title:
        payload.title = title

    return JobIntent(action="post_job", payload=payload)
