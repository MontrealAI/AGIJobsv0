# routes/onebox.py
# FastAPI router for a Web3-only, walletless-by-default "one-box" UX.
# Exposes: POST /onebox/plan, POST /onebox/execute, GET /onebox/status,
# plus /healthz and /onebox/metrics (Prometheus).
# Everything chain-related (keys, gas, ABIs, pinning) stays on the server.

import asyncio
import hashlib
import json
import logging
import os
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, List, Literal, Optional, Tuple

import httpx
import prometheus_client
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from urllib.parse import quote
from web3 import Web3
from web3._utils.events import get_event_data
from web3.middleware import geth_poa_middleware


def require_api(auth: Optional[str] = Header(None, alias="Authorization")):
    if not _API_TOKEN:
        return
    if not auth or not auth.startswith("Bearer "):
        raise _http_error(401, "AUTH_MISSING")
    token = auth.split(" ", 1)[1].strip()
    if token != _API_TOKEN:
        raise _http_error(401, "AUTH_INVALID")


logger = logging.getLogger(__name__)

# ---------- Settings ----------
RPC_URL = os.getenv("RPC_URL", "")
CHAIN_ID = int(os.getenv("CHAIN_ID", "0") or "0")
JOB_REGISTRY = Web3.to_checksum_address(
    os.getenv("JOB_REGISTRY", "0x0000000000000000000000000000000000000000")
)
AGIALPHA_TOKEN = Web3.to_checksum_address(
    os.getenv("AGIALPHA_TOKEN", "0x0000000000000000000000000000000000000000")
)
AGIALPHA_DECIMALS = int(os.getenv("AGIALPHA_DECIMALS", "18") or "18")
_DEFAULT_POLICY_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "storage", "org-policies.json")
)
_RELAYER_PK = os.getenv("ONEBOX_RELAYER_PRIVATE_KEY") or os.getenv("RELAYER_PK", "")
_API_TOKEN = os.getenv("ONEBOX_API_TOKEN") or os.getenv("API_TOKEN", "")
EXPLORER_TX_TPL = os.getenv(
    "ONEBOX_EXPLORER_TX_BASE", os.getenv("EXPLORER_TX_TPL", "https://explorer.example/tx/{tx}")
)
PINNER_KIND = os.getenv("PINNER_KIND", "").lower()
PINNER_ENDPOINT = os.getenv("PINNER_ENDPOINT", "")
PINNER_TOKEN = os.getenv("PINNER_TOKEN", "")
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

if not RPC_URL:
    raise RuntimeError("RPC_URL is required")

# Minimal ABI (override via JOB_REGISTRY_ABI_JSON for your deployed interface)
_MIN_ABI = [
    {
        "inputs": [
            {"internalType": "string", "name": "uri", "type": "string"},
            {"internalType": "address", "name": "rewardToken", "type": "address"},
            {"internalType": "uint256", "name": "reward", "type": "uint256"},
            {"internalType": "uint256", "name": "deadlineDays", "type": "uint256"},
        ],
        "name": "postJob",
        "outputs": [
            {"internalType": "uint256", "name": "jobId", "type": "uint256"},
        ],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "jobId", "type": "uint256"},
        ],
        "name": "finalize",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "anonymous": False,
        "inputs": [
            {
                "indexed": True,
                "internalType": "uint256",
                "name": "jobId",
                "type": "uint256",
            },
            {
                "indexed": True,
                "internalType": "address",
                "name": "employer",
                "type": "address",
            },
        ],
        "name": "JobCreated",
        "type": "event",
    },
    {
        "inputs": [],
        "name": "lastJobId",
        "outputs": [
            {"internalType": "uint256", "name": "", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "", "type": "uint256"},
        ],
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
            {"internalType": "uint256", "name": "assignedAt", "type": "uint256"},
            {"internalType": "bytes32", "name": "specHash", "type": "bytes32"},
            {"internalType": "string", "name": "uri", "type": "string"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "feePct",
        "outputs": [
            {"internalType": "uint256", "name": "", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "stakeManager",
        "outputs": [
            {"internalType": "address", "name": "", "type": "address"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]
_ABI = json.loads(os.getenv("JOB_REGISTRY_ABI_JSON", json.dumps(_MIN_ABI)))

# ---------- Web3 ----------
w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 45}))
try:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
except Exception:  # pragma: no cover - middleware injection is best effort
    pass
if CHAIN_ID and w3.eth.chain_id != CHAIN_ID:
    logger.warning(
        "chain id mismatch: provider=%s expected=%s", w3.eth.chain_id, CHAIN_ID
    )
registry = w3.eth.contract(address=JOB_REGISTRY, abi=_ABI)
relayer = w3.eth.account.from_key(_RELAYER_PK) if _RELAYER_PK else None


def _parse_default_percentage(*env_keys: str, fallback: str) -> Decimal:
    for key in env_keys:
        raw = os.getenv(key)
        if raw is None:
            continue
        value = raw.strip()
        if not value:
            continue
        try:
            parsed = Decimal(value)
        except InvalidOperation:
            logger.warning("invalid percentage configured for %s: %s", key, raw)
            continue
        if Decimal(0) <= parsed <= Decimal(100):
            return parsed
        logger.warning("percentage for %s out of range 0-100: %s", key, raw)
    return Decimal(fallback)


_DEFAULT_FEE_PCT = _parse_default_percentage(
    "ONEBOX_DEFAULT_FEE_PCT", "ONEBOX_FEE_PCT", "FEE_PCT", fallback="5"
)
_DEFAULT_BURN_PCT = _parse_default_percentage(
    "ONEBOX_DEFAULT_BURN_PCT", "ONEBOX_BURN_PCT", "BURN_PCT", fallback="2"
)

_cached_fee_pct: Decimal = _DEFAULT_FEE_PCT
_cached_burn_pct: Decimal = _DEFAULT_BURN_PCT
_fee_policy_loaded = False
_fee_policy_lock = threading.Lock()

# ---------- Metrics ----------
_METRICS_REGISTRY = prometheus_client.CollectorRegistry()
_PLAN_TOTAL = prometheus_client.Counter(
    "plan_total",
    "Total /onebox/plan requests",
    ["intent_type", "http_status"],
    registry=_METRICS_REGISTRY,
)
_SIMULATE_TOTAL = prometheus_client.Counter(
    "simulate_total",
    "Total /onebox/simulate requests",
    ["intent_type", "http_status"],
    registry=_METRICS_REGISTRY,
)
_EXECUTE_TOTAL = prometheus_client.Counter(
    "execute_total",
    "Total /onebox/execute requests",
    ["intent_type", "http_status"],
    registry=_METRICS_REGISTRY,
)
_STATUS_TOTAL = prometheus_client.Counter(
    "status_total",
    "Total /onebox/status requests",
    ["intent_type", "http_status"],
    registry=_METRICS_REGISTRY,
)
_TTO_SECONDS = prometheus_client.Histogram(
    "time_to_outcome_seconds",
    "End-to-end time to outcome in seconds",
    ["endpoint"],
    registry=_METRICS_REGISTRY,
)


_plan_cache_lock = threading.Lock()
_plan_cache: Dict[str, str] = {}


def _current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_plan_hash(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise _http_error(400, "PLAN_HASH_INVALID")
    trimmed = value.strip().lower()
    if not trimmed:
        return None
    if not trimmed.startswith("0x"):
        trimmed = f"0x{trimmed}"
    if re.fullmatch(r"0x[0-9a-f]{64}", trimmed):
        return trimmed
    raise _http_error(400, "PLAN_HASH_INVALID")


def _store_plan_metadata(plan_hash: str, created_at: str) -> None:
    if not plan_hash:
        return
    with _plan_cache_lock:
        _plan_cache[plan_hash] = created_at


def _lookup_plan_timestamp(plan_hash: Optional[str]) -> Optional[str]:
    if not plan_hash:
        return None
    with _plan_cache_lock:
        return _plan_cache.get(plan_hash)


def _normalize_timestamp(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return None
        try:
            if trimmed.endswith("Z"):
                parsed = datetime.fromisoformat(trimmed.replace("Z", "+00:00"))
            else:
                parsed = datetime.fromisoformat(trimmed)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            else:
                parsed = parsed.astimezone(timezone.utc)
            return parsed.isoformat().replace("+00:00", "Z")
        except ValueError:
            try:
                as_float = float(trimmed)
            except ValueError:
                return None
            dt = datetime.fromtimestamp(as_float, tz=timezone.utc)
            return dt.isoformat().replace("+00:00", "Z")
    return None


def _canonical_plan_envelope(intent: "JobIntent") -> Dict[str, Any]:
    payload = json.loads(intent.json(exclude_none=True, by_alias=True))
    return {"version": 1, "intent": payload}


def _stable_stringify(value: Any) -> str:
    if isinstance(value, list):
        return "[" + ",".join(_stable_stringify(item) for item in value) + "]"
    if isinstance(value, dict):
        items = []
        for key in sorted(value.keys()):
            val = value[key]
            if val is None:
                continue
            items.append(f"{json.dumps(str(key))}:{_stable_stringify(val)}")
        return "{" + ",".join(items) + "}"
    if isinstance(value, Decimal):
        return json.dumps(str(value))
    return json.dumps(value)


def _compute_plan_hash(intent: "JobIntent") -> str:
    envelope = _canonical_plan_envelope(intent)
    canonical = _stable_stringify(envelope)
    return "0x" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _get_correlation_id(request: Request) -> str:
    if hasattr(request.state, "correlation_id"):
        return request.state.correlation_id  # type: ignore[attr-defined]
    header = request.headers.get("X-Correlation-ID") or request.headers.get("X-Request-ID")
    correlation_id = header.strip() if header and header.strip() else uuid.uuid4().hex
    request.state.correlation_id = correlation_id  # type: ignore[attr-defined]
    return correlation_id


def _log_event(level: int, event: str, correlation_id: str, **fields: Any) -> None:
    payload = {
        "event": event,
        "correlation_id": correlation_id,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    payload.update(fields)
    logger.log(level, json.dumps(payload, sort_keys=True))

# ---------- API Router ----------
router = APIRouter(prefix="/onebox", tags=["onebox"])
health_router = APIRouter(tags=["health"])


# ---------- Models ----------
Action = Literal[
    "post_job",
    "finalize_job",
    "check_status",
    "stake",
    "validate",
    "dispute",
]


class Attachment(BaseModel):
    name: str
    ipfs: Optional[str] = None
    type: Optional[str] = None
    url: Optional[str] = None


class Payload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    attachments: List[Attachment] = Field(default_factory=list)
    rewardToken: str = AGIALPHA_SYMBOL
    reward: Optional[str] = None
    deadlineDays: Optional[int] = None
    jobId: Optional[int] = None
    agentTypes: Optional[int] = None


class JobIntent(BaseModel):
    action: Action
    payload: Payload
    constraints: Dict[str, Any] = Field(default_factory=dict)
    userContext: Dict[str, Any] = Field(default_factory=dict)


class PlanRequest(BaseModel):
    text: str
    expert: bool = False


class PlanResponse(BaseModel):
    summary: str
    intent: JobIntent
    requiresConfirmation: bool = True
    warnings: List[str] = Field(default_factory=list)
    planHash: str
    missingFields: List[str] = Field(default_factory=list)


class ExecuteRequest(BaseModel):
    intent: JobIntent
    mode: Literal["relayer", "wallet"] = "relayer"
    planHash: Optional[str] = None
    createdAt: Optional[str] = None


class SimulateRequest(BaseModel):
    intent: JobIntent
    planHash: Optional[str] = None
    createdAt: Optional[str] = None


class SimulateResponse(BaseModel):
    summary: str
    intent: JobIntent
    risks: List[str] = Field(default_factory=list)
    blockers: List[str] = Field(default_factory=list)
    planHash: str
    createdAt: str


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
    burnPct: Optional[float] = None
    feeAmount: Optional[str] = None
    burnAmount: Optional[str] = None


class StatusResponse(BaseModel):
    jobId: int
    state: Literal["open", "assigned", "completed", "finalized", "unknown", "disputed"] = (
        "unknown"
    )
    reward: Optional[str] = None
    token: Optional[str] = None
    deadline: Optional[int] = None
    assignee: Optional[str] = None


_UINT64_MAX = (1 << 64) - 1
_STATE_MAP = {
    0: "draft",
    1: "open",
    2: "assigned",
    3: "review",
    4: "completed",
    5: "disputed",
    6: "finalized",
}

_ERRORS = {
    # Top user-facing errors surfaced to the client application
    "REQUEST_EMPTY": "Describe the job or action you want me to handle before continuing.",
    "AUTH_MISSING": "Include your API token so I can link this request to your identity. Start identity setup if you haven’t yet.",
    "AUTH_INVALID": "Your API token didn’t match an active identity. Refresh your credentials or restart identity setup.",
    "IDENTITY_SETUP_REQUIRED": "Finish identity verification in the Agent Gateway before using this one-box flow.",
    "STAKE_REQUIRED": "Stake the minimum AGIALPHA before continuing. Add funds or reduce the job’s stake size.",
    "INSUFFICIENT_BALANCE": "You need more AGIALPHA available to cover the reward and stake. Top up or adjust the amounts.",
    "INSUFFICIENT_ALLOWANCE": "Approve AGIALPHA spending from your wallet so I can move the staked funds for you.",
    "DEADLINE_INVALID": "Choose a deadline at least 24 hours out and within the protocol’s maximum window.",
    "AA_PAYMASTER_REJECTED": "The account abstraction paymaster rejected this request. Retry shortly or submit the transaction manually.",
    "VALIDATION_TIMEOUT": "Validator checks didn’t finish in time. Retry in a moment or contact support if it keeps failing.",
    "DISPUTE_OPENED": "A dispute is already open for this job. Wait for resolution before taking further action.",
    "CID_MISMATCH": "The deliverable CID didn’t match what’s on record. Re-upload the correct artifact and try again.",
    "RPC_TIMEOUT": "The blockchain RPC endpoint timed out. Try again or switch to a healthier provider.",
    "UNKNOWN_REVERT": "The transaction reverted without a known reason. Check the logs or retry with adjusted parameters.",
    "IPFS_TEMPORARY": "The pinning service is busy. Wait a moment and re-upload your request.",
    "IPFS_FAILED": "I couldn’t package your job details. Remove broken links and try again.",
    "RELAY_UNAVAILABLE": "The relayer is offline right now. Switch to wallet mode or retry shortly.",
    "JOB_ID_REQUIRED": "Provide the jobId you want me to act on before continuing.",
    "JOB_BUDGET_CAP_EXCEEDED": "Requested reward exceeds the configured cap for your organisation.",
    "JOB_DEADLINE_CAP_EXCEEDED": "Requested deadline exceeds the configured cap for your organisation.",
    "REWARD_INVALID": "Enter the reward as a numeric AGIALPHA amount before submitting.",
    "PLAN_HASH_REQUIRED": "Send the plan hash from the planning step so I can link this request to its original plan.",
    "PLAN_HASH_INVALID": "Use the 32-byte plan hash from the planning step before continuing.",
    "PLAN_HASH_MISMATCH": "The plan hash doesn’t match this request. Re-run planning and retry.",
    "UNSUPPORTED_ACTION": "I didn’t understand that action. Rephrase the request or choose a supported workflow.",
    "UNKNOWN": "Something went wrong on my side. I’ve logged it and you can retry once things settle down.",
}


def _error_detail(code: str) -> Dict[str, str]:
    message = _ERRORS.get(code)
    if message is None:
        message = "Something went wrong. Reference code {} when contacting support.".format(code)
    return {"code": code, "message": message}


def _http_error(status_code: int, code: str) -> HTTPException:
    return HTTPException(status_code, _error_detail(code))


# ---------- Helpers ----------
_SUMMARY_SUFFIX = " Proceed?"
_STAKE_MANAGER_ABI = [
    {
        "inputs": [],
        "name": "burnPct",
        "outputs": [
            {"internalType": "uint256", "name": "", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    }
]


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


def _parse_percentage_candidate(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        parsed = Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        return None
    if Decimal(0) <= parsed <= Decimal(100):
        return parsed
    return None


def _get_fee_policy() -> Tuple[Decimal, Decimal]:
    global _fee_policy_loaded, _cached_fee_pct, _cached_burn_pct
    if _fee_policy_loaded:
        return _cached_fee_pct, _cached_burn_pct
    with _fee_policy_lock:
        if _fee_policy_loaded:
            return _cached_fee_pct, _cached_burn_pct
        fee_pct = _DEFAULT_FEE_PCT
        burn_pct = _DEFAULT_BURN_PCT
        try:
            fee_fn = getattr(registry.functions, "feePct", None)
            if fee_fn is not None:
                fee_raw = fee_fn().call()
                parsed_fee = _parse_percentage_candidate(fee_raw)
                if parsed_fee is not None:
                    fee_pct = parsed_fee
            stake_manager_fn = getattr(registry.functions, "stakeManager", None)
            stake_manager_address = None
            if stake_manager_fn is not None:
                stake_manager_address = stake_manager_fn().call()
            if isinstance(stake_manager_address, (bytes, bytearray)):
                stake_manager_address = Web3.to_hex(stake_manager_address)
            is_valid_address = False
            if isinstance(stake_manager_address, str) and Web3.is_address(stake_manager_address):
                try:
                    is_valid_address = int(stake_manager_address, 16) != 0
                except ValueError:
                    is_valid_address = False
            if is_valid_address:
                stake_manager_contract = w3.eth.contract(
                    address=Web3.to_checksum_address(stake_manager_address),
                    abi=_STAKE_MANAGER_ABI,
                )
                try:
                    burn_raw = stake_manager_contract.functions.burnPct().call()
                    parsed_burn = _parse_percentage_candidate(burn_raw)
                    if parsed_burn is not None:
                        burn_pct = parsed_burn
                except Exception as exc:
                    logger.warning("failed to load burnPct: %s", exc)
        except Exception as exc:
            logger.warning("failed to load fee policy: %s", exc)
        _cached_fee_pct = fee_pct
        _cached_burn_pct = burn_pct
        _fee_policy_loaded = True
        return fee_pct, burn_pct


def _to_wei(amount: str) -> int:
    return int(Decimal(amount) * Decimal(10**AGIALPHA_DECIMALS))


def _format_reward(value: int) -> str:
    precision = Decimal(10**AGIALPHA_DECIMALS)
    return str(Decimal(value) / precision)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _resolve_policy_path() -> str:
    override = os.getenv("ONEBOX_POLICY_PATH")
    if override and override.strip():
        return os.path.abspath(override.strip())
    return _DEFAULT_POLICY_PATH


def _parse_default_max_budget() -> Optional[int]:
    owner_cap = os.getenv("ORG_MAX_BUDGET_WEI")
    if owner_cap is not None:
        trimmed_owner = owner_cap.strip()
        if trimmed_owner:
            try:
                parsed_owner = int(trimmed_owner, 10)
            except ValueError:
                logger.warning("invalid ORG_MAX_BUDGET_WEI value: %s", owner_cap)
            else:
                if parsed_owner > 0:
                    return parsed_owner
                return None
    raw = os.getenv("ONEBOX_MAX_JOB_BUDGET_AGIA")
    if not raw:
        return None
    trimmed = raw.strip()
    if not trimmed:
        return None
    try:
        value = Decimal(trimmed)
    except InvalidOperation:
        logger.warning("invalid ONEBOX_MAX_JOB_BUDGET_AGIA value: %s", raw)
        return None
    if value < 0:
        logger.warning("invalid ONEBOX_MAX_JOB_BUDGET_AGIA value: %s", raw)
        return None
    quantized = (value * Decimal(10**AGIALPHA_DECIMALS)).to_integral_value(rounding=ROUND_HALF_UP)
    return int(quantized)


def _parse_default_max_duration() -> Optional[int]:
    owner_cap = os.getenv("ORG_MAX_DEADLINE_DAYS")
    if owner_cap is not None:
        trimmed_owner = owner_cap.strip()
        if trimmed_owner:
            try:
                parsed_owner = int(trimmed_owner, 10)
            except ValueError:
                logger.warning("invalid ORG_MAX_DEADLINE_DAYS value: %s", owner_cap)
            else:
                if parsed_owner > 0:
                    return parsed_owner
                return None
    raw = os.getenv("ONEBOX_MAX_JOB_DURATION_DAYS")
    if not raw:
        return None
    trimmed = raw.strip()
    if not trimmed:
        return None
    try:
        parsed = int(trimmed, 10)
    except ValueError:
        logger.warning("invalid ONEBOX_MAX_JOB_DURATION_DAYS value: %s", raw)
        return None
    if parsed <= 0:
        logger.warning("invalid ONEBOX_MAX_JOB_DURATION_DAYS value: %s", raw)
        return None
    return parsed


@dataclass
class OrgPolicyRecord:
    max_budget_wei: Optional[int] = None
    max_duration_days: Optional[int] = None
    updated_at: str = field(default_factory=_utcnow_iso)


class OrgPolicyViolation(Exception):
    def __init__(self, code: str, message: str, record: OrgPolicyRecord) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.record = record

    def to_http_exception(self) -> HTTPException:
        detail = _error_detail(self.code)
        detail["message"] = self.message
        return HTTPException(status_code=400, detail=detail)


class OrgPolicyStore:
    def __init__(
        self,
        *,
        policy_path: Optional[str] = None,
        default_max_budget_wei: Optional[int] = None,
        default_max_duration_days: Optional[int] = None,
    ) -> None:
        self._policy_path = policy_path or _resolve_policy_path()
        self._default_max_budget_wei = default_max_budget_wei
        self._default_max_duration_days = default_max_duration_days
        self._policies: Dict[str, OrgPolicyRecord] = {}
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        try:
            if not os.path.exists(self._policy_path):
                return
            with open(self._policy_path, "r", encoding="utf-8") as handle:
                raw = handle.read()
            if not raw:
                return
            data = json.loads(raw)
            if not isinstance(data, dict):
                return
            for key, value in data.items():
                if not isinstance(value, dict):
                    continue
                record = OrgPolicyRecord()
                stored_budget = value.get("maxBudgetWei")
                if isinstance(stored_budget, str):
                    try:
                        record.max_budget_wei = int(stored_budget, 10)
                    except ValueError:
                        pass
                elif isinstance(stored_budget, int):
                    record.max_budget_wei = stored_budget
                stored_duration = value.get("maxDurationDays")
                if isinstance(stored_duration, int) and stored_duration > 0:
                    record.max_duration_days = stored_duration
                updated_at = value.get("updatedAt")
                if isinstance(updated_at, str) and updated_at.strip():
                    record.updated_at = updated_at.strip()
                self._policies[self._resolve_key(key)] = record
        except Exception as exc:  # pragma: no cover - defensive loading
            logger.warning("failed to load org policy store: %s", exc)

    def _persist_locked(self) -> None:
        try:
            directory = os.path.dirname(self._policy_path)
            if directory and not os.path.exists(directory):
                os.makedirs(directory, exist_ok=True)
            payload: Dict[str, Dict[str, Any]] = {}
            for key, record in self._policies.items():
                payload[key] = {
                    "updatedAt": record.updated_at,
                }
                if record.max_budget_wei is not None:
                    payload[key]["maxBudgetWei"] = str(record.max_budget_wei)
                if record.max_duration_days is not None:
                    payload[key]["maxDurationDays"] = record.max_duration_days
            with open(self._policy_path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2, sort_keys=True)
        except Exception as exc:  # pragma: no cover - defensive persistence
            logger.warning("failed to persist org policy store: %s", exc)

    @staticmethod
    def _resolve_key(org_id: Optional[str]) -> str:
        if isinstance(org_id, str):
            trimmed = org_id.strip()
            if trimmed:
                return trimmed
        return "__default__"

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
        if record.max_budget_wei is not None or record.max_duration_days is not None:
            self._persist_locked()
        return record

    def enforce(self, org_id: Optional[str], reward_wei: int, deadline_days: int) -> OrgPolicyRecord:
        with self._lock:
            record = self._get_or_create(org_id)
            if record.max_budget_wei is not None and reward_wei > record.max_budget_wei:
                message = (
                    "Requested budget {} AGIALPHA exceeds organisation cap of {} AGIALPHA.".format(
                        _format_reward(reward_wei), _format_reward(record.max_budget_wei)
                    )
                )
                raise OrgPolicyViolation("JOB_BUDGET_CAP_EXCEEDED", message, record)
            if record.max_duration_days is not None and deadline_days > record.max_duration_days:
                message = (
                    "Requested deadline of {} days exceeds organisation cap of {} days.".format(
                        deadline_days, record.max_duration_days
                    )
                )
                raise OrgPolicyViolation("JOB_DEADLINE_CAP_EXCEEDED", message, record)
            return record

    def update(
        self,
        org_id: Optional[str],
        *,
        max_budget_wei: Optional[int] = None,
        max_duration_days: Optional[int] = None,
    ) -> None:
        with self._lock:
            record = self._get_or_create(org_id)
            if max_budget_wei is not None:
                record.max_budget_wei = max_budget_wei
            if max_duration_days is not None:
                record.max_duration_days = max_duration_days
            record.updated_at = _utcnow_iso()
            self._persist_locked()


_ORG_POLICY_STORE: Optional[OrgPolicyStore] = None
_ORG_POLICY_LOCK = threading.Lock()


def _get_org_policy_store() -> OrgPolicyStore:
    global _ORG_POLICY_STORE
    if _ORG_POLICY_STORE is not None:
        return _ORG_POLICY_STORE
    with _ORG_POLICY_LOCK:
        if _ORG_POLICY_STORE is not None:
            return _ORG_POLICY_STORE
        _ORG_POLICY_STORE = OrgPolicyStore(
            policy_path=_resolve_policy_path(),
            default_max_budget_wei=_parse_default_max_budget(),
            default_max_duration_days=_parse_default_max_duration(),
        )
    return _ORG_POLICY_STORE


def _resolve_org_identifier(intent: "JobIntent") -> Optional[str]:
    context = intent.userContext or {}
    if not isinstance(context, dict):
        return None
    for key in ("orgId", "organizationId", "tenantId", "teamId", "userId"):
        value = context.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _normalize_title(text: str) -> str:
    s = re.sub(r"\s+", " ", text).strip()
    return s[:160] if s else "New Job"


_JOB_ID_PATTERN = re.compile(
    r"""
    \bjob
    (?:
        \s*(?:\#|id(?:entifier)?|number|no\.?|num\.?)?
    )
    \s*[:#-]?
    \s*(\d+)
    \b
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _extract_job_id(text: str) -> Optional[int]:
    match = _JOB_ID_PATTERN.search(text)
    if match:
        return int(match.group(1))
    return None


def _format_job_id(job_id: Optional[int]) -> str:
    if job_id is None:
        return "#?"
    return f"#{job_id}"


def _detect_action(text: str) -> Optional[str]:
    lowered = text.lower()
    if any(token in lowered for token in ["finalize", "complete", "finish", "payout", "pay out"]):
        return "finalize_job"
    if any(token in lowered for token in ["status", "state", "progress", "check on"]):
        return "check_status"
    if "stake" in lowered:
        return "stake"
    if "validate" in lowered:
        return "validate"
    if "dispute" in lowered:
        return "dispute"
    return None


def _parse_reward(text: str) -> Optional[str]:
    amt = re.search(r"(\d+(?:\.\d+)?)\s*(?:agi|agialpha)", text, re.IGNORECASE)
    return amt.group(1) if amt else None


def _parse_deadline_days(text: str) -> Optional[int]:
    match = re.search(r"(\d+)\s*(?:d|day|days)", text, re.IGNORECASE)
    return int(match.group(1)) if match else None


def _calculate_deadline_timestamp(days: int) -> int:
    if days <= 0:
        raise _http_error(400, "DEADLINE_INVALID")
    seconds = days * 86400
    if seconds > _UINT64_MAX:
        raise _http_error(400, "DEADLINE_INVALID")
    now = int(time.time())
    deadline = now + seconds
    if deadline > _UINT64_MAX:
        raise _http_error(400, "DEADLINE_INVALID")
    return deadline


def _compute_spec_hash(payload: Dict[str, Any]) -> bytes:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return Web3.keccak(canonical)


def _naive_parse(text: str) -> JobIntent:
    action = _detect_action(text)
    job_id = _extract_job_id(text) if action in {"finalize_job", "check_status", "stake", "validate", "dispute"} else None
    if action:
        payload = Payload(jobId=job_id)
        return JobIntent(action=action, payload=payload)

    reward = _parse_reward(text)
    deadline_days = _parse_deadline_days(text)
    title = _normalize_title(text)
    payload = Payload(title=title, reward=reward, deadlineDays=deadline_days)
    return JobIntent(action="post_job", payload=payload)


def _summary_for_intent(intent: JobIntent, request_text: str) -> Tuple[str, bool, List[str]]:
    warnings: List[str] = []
    request_snippet = request_text.strip()
    snippet = f" ({request_snippet})" if request_snippet else ""
    if intent.action == "finalize_job":
        jid = intent.payload.jobId
        summary = (
            f"Detected job finalization request for job {_format_job_id(jid)}. "
            f"Confirm to finalize job {_format_job_id(jid)}. Proceed?"
        )
        return _ensure_summary_limit(summary), True, warnings
    if intent.action == "check_status":
        jid = intent.payload.jobId
        summary = f"Detected job status request for job {_format_job_id(jid)}.{snippet}".rstrip(".") + "."
        return summary, False, warnings
    if intent.action == "stake":
        jid = intent.payload.jobId
        summary = (
            f"Detected staking request for job {_format_job_id(jid)}.{snippet} "
            "Confirm to continue. Proceed?"
        )
        return _ensure_summary_limit(summary), True, warnings
    if intent.action == "validate":
        jid = intent.payload.jobId
        summary = (
            f"Detected validation request for job {_format_job_id(jid)}.{snippet} "
            "Confirm to assign validators. Proceed?"
        )
        return _ensure_summary_limit(summary), True, warnings
    if intent.action == "dispute":
        jid = intent.payload.jobId
        summary = (
            f"Detected dispute request for job {_format_job_id(jid)}.{snippet} "
            f"Confirm to escalate job {_format_job_id(jid)}. Proceed?"
        )
        return _ensure_summary_limit(summary), True, warnings

    payload = intent.payload
    reward = payload.reward
    default_reward_applied = False
    if reward is None or (isinstance(reward, str) and not reward.strip()):
        parsed_reward = _parse_reward(request_text)
        if parsed_reward is not None:
            reward = parsed_reward
        else:
            reward = "1.0"
            default_reward_applied = True
    days = payload.deadlineDays
    default_deadline_applied = False
    if days is None:
        parsed_days = _parse_deadline_days(request_text)
        if parsed_days is not None:
            days = parsed_days
        else:
            days = 7
            default_deadline_applied = True
    token = (payload.rewardToken or AGIALPHA_SYMBOL).strip() or AGIALPHA_SYMBOL
    fee_pct, burn_pct = _get_fee_policy()
    reward_text = str(reward).strip() or "0"
    fee_text = _format_percentage(fee_pct)
    burn_text = _format_percentage(burn_pct)
    summary = (
        f"Post job {reward_text} {token}, {days} days. "
        f"Fee {fee_text}%, burn {burn_text}%. Proceed?"
    )
    if default_reward_applied:
        warnings.append("DEFAULT_REWARD_APPLIED")
    if default_deadline_applied:
        warnings.append("DEFAULT_DEADLINE_APPLIED")
    return _ensure_summary_limit(summary), True, warnings


def _detect_missing_fields(intent: JobIntent) -> List[str]:
    missing: List[str] = []
    payload = intent.payload
    if intent.action == "post_job":
        reward = getattr(payload, "reward", None)
        if reward is None or (isinstance(reward, str) and not reward.strip()):
            missing.append("reward")
        deadline_days = getattr(payload, "deadlineDays", None)
        if deadline_days is None:
            missing.append("deadlineDays")
    elif intent.action in {"finalize_job", "check_status", "stake", "validate", "dispute"}:
        if getattr(payload, "jobId", None) is None:
            missing.append("jobId")
    return missing


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
    for template in templates or []:
        url = template.format(cid=cid)
        if url not in urls:
            urls.append(url)
    if provider in {"web3.storage", "nft.storage"}:
        for tpl in ["https://w3s.link/ipfs/{cid}", "https://{cid}.ipfs.w3s.link"]:
            url = tpl.format(cid=cid)
            if url not in urls:
                urls.append(url)
    if provider == "pinata":
        for tpl in ["https://gateway.pinata.cloud/ipfs/{cid}", "https://ipfs.pinata.cloud/ipfs/{cid}"]:
            url = tpl.format(cid=cid)
            if url not in urls:
                urls.append(url)
    for tpl in DEFAULT_GATEWAYS:
        url = tpl.format(cid=cid)
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
            PinningProvider(
                name=name,
                endpoint=endpoint,
                token=token,
                gateway_templates=templates,
            )
        )

    if PINNER_ENDPOINT and PINNER_TOKEN:
        add_provider(
            _detect_provider(PINNER_ENDPOINT, PINNER_KIND or None),
            PINNER_ENDPOINT,
            PINNER_TOKEN,
        )

    if WEB3_STORAGE_TOKEN:
        add_provider(
            "web3.storage",
            WEB3_STORAGE_ENDPOINT,
            WEB3_STORAGE_TOKEN,
            ["https://w3s.link/ipfs/{cid}", "https://{cid}.ipfs.w3s.link"],
        )

    pinata_token = PINATA_JWT
    if not pinata_token and PINATA_API_KEY and PINATA_SECRET_API_KEY:
        pinata_token = f"{PINATA_API_KEY}:{PINATA_SECRET_API_KEY}"
    if pinata_token:
        add_provider(
            "pinata",
            PINATA_ENDPOINT,
            pinata_token,
            [
                f"{PINATA_GATEWAY.rstrip('/')}/ipfs/{{cid}}",
                "https://gateway.pinata.cloud/ipfs/{cid}",
                "https://ipfs.pinata.cloud/ipfs/{cid}",
            ],
        )

    return providers


def _extract_cid(payload: Any) -> Optional[str]:
    if not payload:
        return None
    if isinstance(payload, str):
        stripped = payload.strip()
        if not stripped:
            return None
        try:
            return _extract_cid(json.loads(stripped))
        except ValueError:
            return stripped
    if isinstance(payload, dict):
        for key in ("cid", "Cid", "IpfsHash", "Hash", "value"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
        nested = payload.get("pin") or payload.get("data") or payload.get("value")
        if isinstance(nested, dict):
            candidate = _extract_cid(nested)
            if candidate:
                return candidate
        for value in payload.values():
            if isinstance(value, dict):
                candidate = _extract_cid(value)
                if candidate:
                    return candidate
            if isinstance(value, str) and value.startswith("baf"):
                return value
    return None


async def _fetch_pin_status(
    provider: str, base_url: str, token: str, cid: str
) -> Dict[str, Any]:
    headers = _build_auth_headers(provider, token)
    if not headers:
        return {}
    status_url = (
        f"{_strip_slashes(base_url)}/data/pinList?cid={quote(cid)}"
        if provider == "pinata"
        else f"{_strip_slashes(base_url)}/pins/{cid}"
    )
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(status_url, headers=headers)
    if response.status_code // 100 != 2:
        if _is_retryable_status(response.status_code):
            raise PinningError(
                f"status check failed: {response.status_code}",
                provider,
                response.status_code,
                True,
            )
        return {}
    try:
        data = response.json()
    except ValueError:
        return {}
    if provider == "pinata":
        rows = data.get("rows") if isinstance(data, dict) else None
        first = rows[0] if isinstance(rows, list) and rows else None
        if isinstance(first, dict):
            return {
                "status": first.get("status"),
                "size": first.get("size") or first.get("pinSize"),
                "pinned_at": first.get("date_pinned") or first.get("timestamp"),
            }
        return {}
    pin = data.get("pin") if isinstance(data, dict) else None
    status = data.get("status") if isinstance(data, dict) else None
    size = data.get("pinSize") if isinstance(data, dict) else None
    pinned_at = data.get("created") if isinstance(data, dict) else None
    if isinstance(pin, dict):
        status = pin.get("status") or status
        size = pin.get("size") or size
        pinned_at = pin.get("created") or pinned_at
    return {"status": status, "size": size, "pinned_at": pinned_at}


async def _pin_bytes(content: bytes, content_type: str, file_name: str) -> Dict[str, Any]:
    providers = _resolve_pinners()
    if not providers:
        cid = "bafkreigh2akiscaildcdevcidxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        logger.warning("pinning disabled; returning static CID")
        return _build_pin_result("static", cid, 0, "mock")

    retryable_errors: List[PinningError] = []

    for provider in providers:
        upload_url = _ensure_upload_url(provider.endpoint, provider.name)
        base_url = _provider_base_url(provider.endpoint, provider.name)
        headers = _build_auth_headers(provider.name, provider.token)
        attempts = 3
        for attempt in range(1, attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=45) as client:
                    if provider.name == "pinata" and "pinata_api_key" not in headers:
                        form_headers = headers.copy()
                        files = {
                            "file": (file_name, content, content_type),
                        }
                        metadata = {
                            "name": file_name,
                            "keyvalues": {"source": "onebox-server"},
                        }
                        response = await client.post(
                            upload_url,
                            headers=form_headers,
                            files=files,
                            data={"pinataMetadata": json.dumps(metadata)},
                        )
                    elif provider.name == "pinata":
                        form_headers = headers.copy()
                        files = {
                            "file": (file_name, content, content_type),
                        }
                        metadata = {
                            "name": file_name,
                            "keyvalues": {"source": "onebox-server"},
                        }
                        response = await client.post(
                            upload_url,
                            headers=form_headers,
                            files=files,
                            data={"pinataMetadata": json.dumps(metadata)},
                        )
                    else:
                        post_headers = headers.copy()
                        post_headers.setdefault("Content-Type", content_type)
                        if file_name:
                            post_headers.setdefault("X-Name", file_name)
                        response = await client.post(
                            upload_url,
                            headers=post_headers,
                            content=content,
                        )
                body_text = response.text
                if response.status_code // 100 != 2:
                    raise PinningError(
                        f"pinning service responded with {response.status_code}: {body_text[:200]}",
                        provider.name,
                        response.status_code,
                        _is_retryable_status(response.status_code),
                    )
                payload: Any
                if "application/json" in (response.headers.get("content-type") or ""):
                    try:
                        payload = response.json()
                    except ValueError:
                        payload = body_text
                else:
                    payload = body_text
                cid = _extract_cid(payload)
                if not cid:
                    raise PinningError("pinning response missing CID", provider.name)
                status = None
                request_id = None
                size = None
                pinned_at = None
                if isinstance(payload, dict):
                    pin = payload.get("pin") if isinstance(payload.get("pin"), dict) else None
                    request_id = payload.get("requestid") or payload.get("requestId")
                    status = payload.get("status") or (pin.get("status") if pin else None)
                    size = (
                        pin.get("size")
                        if pin and isinstance(pin.get("size"), (int, float))
                        else payload.get("PinSize")
                    )
                    timestamp = payload.get("Timestamp") or payload.get("created")
                    pinned_at = timestamp if isinstance(timestamp, str) else None
                try:
                    await asyncio.sleep(0.2)
                    status_info = await _fetch_pin_status(
                        provider.name, base_url, provider.token, cid
                    )
                    status = status_info.get("status") or status
                    size = status_info.get("size") or size
                    pinned_at = status_info.get("pinned_at") or pinned_at
                except PinningError as exc:
                    if exc.retryable:
                        logger.warning("pin status check retryable error: %s", exc)
                    else:
                        logger.debug("pin status check non-retryable error: %s", exc)
                return _build_pin_result(
                    provider.name,
                    cid,
                    attempt,
                    status=status or "pinned",
                    request_id=request_id,
                    size=int(size) if isinstance(size, (int, float)) else None,
                    pinned_at=pinned_at,
                    templates=provider.gateway_templates,
                )
            except (httpx.RequestError, PinningError) as exc:  # pragma: no cover - runtime only
                error = exc if isinstance(exc, PinningError) else PinningError(str(exc), provider.name, retryable=True)
                if not error.retryable or attempt == attempts:
                    if isinstance(exc, PinningError):
                        if not exc.retryable:
                            raise
                        retryable_errors.append(exc)
                    else:
                        retryable_errors.append(error)
                    break
                await asyncio.sleep(min(1.0 * attempt, 3.0))
        else:
            continue
    if retryable_errors:
        last = retryable_errors[-1]
        logger.error("pinning service unavailable: %s (%s)", last, last.provider)
        raise _http_error(503, "IPFS_TEMPORARY") from retryable_errors[-1]
    raise _http_error(502, "IPFS_FAILED")


async def _pin_json(obj: dict, file_name: str = "payload.json") -> Dict[str, Any]:
    payload = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    return await _pin_bytes(payload, "application/json", file_name)


def _build_tx(func, sender: str) -> dict:
    nonce = w3.eth.get_transaction_count(sender)
    try:
        gas = func.estimate_gas({"from": sender})
    except Exception:  # pragma: no cover - gas estimation is best effort
        gas = 300000
    tx = func.build_transaction({"from": sender, "nonce": nonce, "chainId": CHAIN_ID, "gas": gas})
    try:
        base = w3.eth.get_block("pending").get("baseFeePerGas")
        if base is not None:
            prio = getattr(w3.eth, "max_priority_fee", lambda: 2_000_000_000)()
            tx["maxFeePerGas"] = int(base) * 2 + int(prio)
            tx["maxPriorityFeePerGas"] = int(prio)
        else:
            raise ValueError("no base fee")
    except Exception:  # pragma: no cover - legacy chains fallback
        tx["gasPrice"] = w3.to_wei("5", "gwei")
    return tx


def _encode_wallet_call(func_name: str, args: list) -> Tuple[str, str]:
    data = registry.encodeABI(fn_name=func_name, args=args)
    return registry.address, data


def _decode_job_created(receipt) -> Optional[int]:
    try:
        job_created = registry.events.JobCreated()
        events = job_created.process_receipt(receipt)
        for event in events:
            args = event.get("args") if isinstance(event, dict) else getattr(event, "args", {})
            if args and "jobId" in args:
                return int(args["jobId"])
    except Exception:
        pass
    try:
        event_abi = next(
            (a for a in _ABI if a.get("type") == "event" and a.get("name") == "JobCreated"),
            None,
        )
        if event_abi:
            for log in receipt.get("logs", []):
                try:
                    event = get_event_data(w3.codec, event_abi, log)
                    if event and event.get("event") == "JobCreated":
                        return int(event["args"]["jobId"])
                except Exception:
                    continue
    except Exception:
        pass
    try:
        return int(registry.functions.lastJobId().call())
    except Exception:
        return None


def _decode_metadata(packed: int) -> Tuple[int, Optional[int], Optional[int]]:
    state = packed & 0x7
    deadline = (packed >> 77) & _UINT64_MAX
    assigned = (packed >> 141) & _UINT64_MAX
    return int(state), int(deadline) or None, int(assigned) or None


async def _read_status(job_id: int) -> StatusResponse:
    try:
        job = registry.functions.jobs(int(job_id)).call()
    except Exception as exc:
        logger.error("status read failed for %s: %s", job_id, exc)
        return StatusResponse(jobId=job_id, state="unknown")

    agent = None
    reward = 0
    deadline = None
    state_label = "unknown"

    if isinstance(job, dict):
        agent = job.get("agent")
        reward = int(job.get("reward", 0))
        packed = int(job.get("packedMetadata", 0))
        state_code, deadline, _assigned = _decode_metadata(packed)
        state_label = _STATE_MAP.get(state_code, "unknown")
    elif isinstance(job, (list, tuple)) and len(job) >= 6:
        agent = job[1]
        reward = int(job[2])
        state_code = int(job[5])
        state_label = _STATE_MAP.get(state_code, "unknown")
        if len(job) > 8 and job[8]:
            deadline = int(job[8])
    else:  # pragma: no cover - unexpected ABI shapes
        logger.warning("unknown job payload shape for job %s", job_id)

    assignee = None
    if agent and int(agent, 16) != 0:
        assignee = Web3.to_checksum_address(agent)

    reward_str = _format_reward(reward) if reward else None
    response = StatusResponse(
        jobId=int(job_id),
        state="disputed" if state_label == "disputed" else state_label if state_label in {"open", "assigned", "completed", "finalized"} else "unknown",
        reward=reward_str,
        token=AGIALPHA_TOKEN,
        deadline=deadline,
        assignee=assignee,
    )
    return response


async def _send_relayer_tx(tx: dict) -> Tuple[str, dict]:
    if not relayer:
        raise _http_error(400, "RELAY_UNAVAILABLE")
    signed = relayer.sign_transaction(tx)
    txh = w3.eth.send_raw_transaction(signed.rawTransaction).hex()
    receipt = w3.eth.wait_for_transaction_receipt(txh, timeout=180)
    return txh, dict(receipt)


def _calculate_fee_amounts(reward: Optional[str], fee_pct: Decimal, burn_pct: Decimal) -> Tuple[Optional[str], Optional[str]]:
    if not reward:
        return None, None
    try:
        reward_decimal = Decimal(str(reward))
    except (InvalidOperation, ValueError, TypeError):
        return None, None
    precision = Decimal(10) ** AGIALPHA_DECIMALS
    reward_wei = (reward_decimal * precision).to_integral_value(rounding=ROUND_HALF_UP)
    fee_amount_wei = (reward_wei * fee_pct / Decimal(100)).to_integral_value(rounding=ROUND_HALF_UP)
    burn_amount_wei = (reward_wei * burn_pct / Decimal(100)).to_integral_value(rounding=ROUND_HALF_UP)
    fee_amount = int(fee_amount_wei)
    burn_amount = int(burn_amount_wei)
    fee_str = _format_reward(fee_amount) if fee_amount else None
    burn_str = _format_reward(burn_amount) if burn_amount else None
    return fee_str, burn_str


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


def _build_receipt_payload(
    response: "ExecuteResponse", plan_hash: Optional[str], created_at: Optional[str], tx_hashes: List[str]
) -> Optional[Dict[str, Any]]:
    if not tx_hashes or not plan_hash or not created_at:
        return None
    record: Dict[str, Any] = {
        "planHash": plan_hash,
        "jobId": response.jobId,
        "txHashes": tx_hashes,
        "timestamp": created_at,
    }
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


async def _attach_receipt_artifacts(response: "ExecuteResponse") -> None:
    tx_hashes = _collect_tx_hashes(response.txHashes, response.txHash)
    if tx_hashes:
        response.txHashes = tx_hashes
    else:
        response.txHashes = None
        return
    receipt_payload = _build_receipt_payload(response, response.planHash, response.createdAt, tx_hashes)
    if not receipt_payload:
        return
    response.receipt = receipt_payload
    deliverable_pin = await _pin_json(receipt_payload, "job-deliverable.json")
    cid = deliverable_pin.get("cid")
    uri = deliverable_pin.get("uri")
    gateway_url = deliverable_pin.get("gatewayUrl")
    gateways = deliverable_pin.get("gatewayUrls")
    response.deliverableCid = cid
    response.deliverableUri = uri
    response.deliverableGatewayUrl = gateway_url
    response.deliverableGatewayUrls = gateways
    response.receiptCid = cid
    response.receiptUri = uri
    response.receiptGatewayUrl = gateway_url
    response.receiptGatewayUrls = gateways

# ---------- Routes ----------
@router.post("/plan", response_model=PlanResponse, dependencies=[Depends(require_api)])
async def plan(request: Request, req: PlanRequest):
    start = time.perf_counter()
    correlation_id = _get_correlation_id(request)
    intent_type = "unknown"
    status_code = 200

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
        _store_plan_metadata(plan_hash, created_at)
        response = PlanResponse(
            summary=summary,
            intent=intent,
            requiresConfirmation=requires_confirmation,
            warnings=warnings,
            planHash=plan_hash,
            missingFields=missing_fields,
        )
    except HTTPException as exc:
        status_code = exc.status_code
        _log_event(
            logging.WARNING,
            "onebox.plan.error",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
            error=exc.detail,
        )
        raise
    except Exception as exc:
        status_code = 500
        _log_event(
            logging.ERROR,
            "onebox.plan.error",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
            error=str(exc),
        )
        raise
    else:
        _log_event(
            logging.INFO,
            "onebox.plan.success",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
        )
        return response
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
    provided_hash = _normalize_plan_hash(req.planHash)
    if provided_hash is None:
        raise _http_error(400, "PLAN_HASH_REQUIRED")
    canonical_hash = _compute_plan_hash(intent)
    if provided_hash != canonical_hash:
        raise _http_error(400, "PLAN_HASH_MISMATCH")
    plan_hash = provided_hash
    stored_created_at = _lookup_plan_timestamp(plan_hash)
    request_created_at = _normalize_timestamp(req.createdAt)
    created_at = stored_created_at or request_created_at or _current_timestamp()
    _store_plan_metadata(plan_hash, created_at)

    blockers: List[str] = []
    risks: List[str] = []

    try:
        request_text = ""
        context = intent.userContext if intent and intent.userContext else {}
        if isinstance(context, dict):
            for key in ("requestText", "originalText", "prompt", "text"):
                candidate = context.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    request_text = candidate
                    break
        summary, _requires_confirmation, warnings = _summary_for_intent(intent, request_text)
        if warnings:
            risks.extend(warnings)

        if intent.action == "post_job":
            reward_value = getattr(payload, "reward", None)
            deadline_value = getattr(payload, "deadlineDays", None)
            reward_wei: Optional[int] = None
            deadline_days: Optional[int] = None

            if reward_value is None or (isinstance(reward_value, str) and not reward_value.strip()):
                blockers.append("INSUFFICIENT_BALANCE")
            else:
                try:
                    reward_decimal = Decimal(str(reward_value))
                except (InvalidOperation, ValueError, TypeError):
                    blockers.append("REWARD_INVALID")
                else:
                    if reward_decimal <= Decimal(0):
                        blockers.append("INSUFFICIENT_BALANCE")
                    else:
                        if reward_decimal < Decimal("1"):
                            risks.append("LOW_REWARD")
                        precision = Decimal(10) ** AGIALPHA_DECIMALS
                        reward_wei = int(
                            (reward_decimal * precision).to_integral_value(rounding=ROUND_HALF_UP)
                        )

            if deadline_value is None:
                blockers.append("DEADLINE_INVALID")
            else:
                try:
                    deadline_days = int(deadline_value)
                except (ValueError, TypeError):
                    blockers.append("DEADLINE_INVALID")
                else:
                    if deadline_days <= 0:
                        blockers.append("DEADLINE_INVALID")
                    elif deadline_days <= 2:
                        risks.append("SHORT_DEADLINE")
                    elif deadline_days >= 45:
                        risks.append("LONG_DEADLINE")

            if not blockers and reward_wei is not None and deadline_days is not None:
                org_identifier = _resolve_org_identifier(intent)
                try:
                    _get_org_policy_store().enforce(org_identifier, reward_wei, deadline_days)
                except OrgPolicyViolation as violation:
                    blockers.append(violation.code)

        elif intent.action in {"stake", "validate", "dispute"}:
            blockers.append("UNSUPPORTED_ACTION")
        elif intent.action in {"finalize_job", "check_status"}:
            if getattr(payload, "jobId", None) is None:
                blockers.append("JOB_ID_REQUIRED")
        else:
            blockers.append("UNSUPPORTED_ACTION")

        if blockers:
            status_code = 422
            detail: Dict[str, Any] = {
                "blockers": blockers,
                "planHash": plan_hash,
                "createdAt": created_at,
            }
            if risks:
                detail["risks"] = risks
            raise HTTPException(status_code=422, detail=detail)

        response = SimulateResponse(
            summary=summary,
            intent=intent,
            risks=risks,
            blockers=[],
            planHash=plan_hash,
            createdAt=created_at,
        )
    except HTTPException as exc:
        status_code = exc.status_code
        log_fields: Dict[str, Any] = {
            "intent_type": intent_type,
            "http_status": status_code,
        }
        detail = getattr(exc, "detail", None)
        if status_code == 422 and isinstance(detail, dict):
            blockers_detail = detail.get("blockers")
            if isinstance(blockers_detail, list):
                log_fields["blockers"] = ",".join(blockers_detail)
            risks_detail = detail.get("risks")
            if isinstance(risks_detail, list) and risks_detail:
                log_fields["risks"] = ",".join(risks_detail)
            _log_event(logging.WARNING, "onebox.simulate.blocked", correlation_id, **log_fields)
        else:
            log_fields["error"] = detail
            _log_event(logging.WARNING, "onebox.simulate.error", correlation_id, **log_fields)
        raise
    except Exception as exc:
        status_code = 500
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
        log_fields: Dict[str, Any] = {
            "intent_type": intent_type,
            "http_status": status_code,
        }
        if risks:
            log_fields["risks"] = ",".join(risks)
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
    provided_hash = _normalize_plan_hash(req.planHash)
    if provided_hash is None:
        raise _http_error(400, "PLAN_HASH_REQUIRED")
    canonical_hash = _compute_plan_hash(intent)
    if provided_hash != canonical_hash:
        raise _http_error(400, "PLAN_HASH_MISMATCH")
    plan_hash = provided_hash
    stored_created_at = _lookup_plan_timestamp(plan_hash)
    request_created_at = _normalize_timestamp(req.createdAt)
    created_at = stored_created_at or request_created_at or _current_timestamp()
    _store_plan_metadata(plan_hash, created_at)

    try:
        if intent.action == "post_job":
            if not payload.reward:
                raise _http_error(400, "INSUFFICIENT_BALANCE")
            if payload.deadlineDays is None:
                raise _http_error(400, "DEADLINE_INVALID")

            reward_wei = _to_wei(str(payload.reward))
            deadline_days = int(payload.deadlineDays)
            org_identifier = _resolve_org_identifier(intent)
            try:
                policy_record = _get_org_policy_store().enforce(
                    org_identifier, reward_wei, deadline_days
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
                _log_event(
                    logging.WARNING,
                    "onebox.policy.rejected",
                    correlation_id,
                    **log_fields,
                )
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
                _log_event(
                    logging.INFO,
                    "onebox.policy.accepted",
                    correlation_id,
                    **log_fields,
                )

            deadline_ts = _calculate_deadline_timestamp(deadline_days)
            fee_pct, burn_pct = _get_fee_policy()
            fee_amount, burn_amount = _calculate_fee_amounts(str(payload.reward), fee_pct, burn_pct)
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

            if req.mode == "wallet":
                to, data = _encode_wallet_call(
                    "postJob",
                    [uri, AGIALPHA_TOKEN, reward_wei, deadline_days],
                )
                response = ExecuteResponse(
                    ok=True,
                    planHash=plan_hash,
                    createdAt=created_at,
                    to=to,
                    data=data,
                    value="0x0",
                    chainId=CHAIN_ID,
                    specCid=cid,
                    specUri=uri,
                    specGatewayUrl=spec_pin.get("gatewayUrl"),
                    specGatewayUrls=spec_pin.get("gatewayUrls"),
                    specHash="0x" + spec_hash.hex(),
                    deadline=deadline_ts,
                    reward=str(payload.reward),
                    token=payload.rewardToken,
                    status="prepared",
                    feePct=float(fee_pct),
                    burnPct=float(burn_pct),
                    feeAmount=fee_amount,
                    burnAmount=burn_amount,
                )
            else:
                func = registry.functions.postJob(
                    uri, AGIALPHA_TOKEN, reward_wei, deadline_days
                )
                sender = relayer.address if relayer else intent.userContext.get("sender")
                if not sender:
                    raise _http_error(400, "RELAY_UNAVAILABLE")
                tx = _build_tx(func, sender)
                txh, receipt = await _send_relayer_tx(tx)
                job_id = _decode_job_created(receipt)
                response = ExecuteResponse(
                    ok=True,
                    planHash=plan_hash,
                    createdAt=created_at,
                    jobId=job_id,
                    txHash=txh,
                    txHashes=[txh] if txh else None,
                    receiptUrl=EXPLORER_TX_TPL.format(tx=txh),
                    specCid=cid,
                    specUri=uri,
                    specGatewayUrl=spec_pin.get("gatewayUrl"),
                    specGatewayUrls=spec_pin.get("gatewayUrls"),
                    specHash="0x" + spec_hash.hex(),
                    deadline=deadline_ts,
                    reward=str(payload.reward),
                    token=payload.rewardToken,
                    status="submitted",
                    feePct=float(fee_pct),
                    burnPct=float(burn_pct),
                    feeAmount=fee_amount,
                    burnAmount=burn_amount,
                )
            await _attach_receipt_artifacts(response)

        elif intent.action == "finalize_job":
            if payload.jobId is None:
                raise _http_error(400, "JOB_ID_REQUIRED")
            if req.mode == "wallet":
                to, data = _encode_wallet_call("finalize", [int(payload.jobId)])
                response = ExecuteResponse(
                    ok=True,
                    planHash=plan_hash,
                    createdAt=created_at,
                    to=to,
                    data=data,
                    value="0x0",
                    chainId=CHAIN_ID,
                    jobId=int(payload.jobId),
                    status="prepared",
                )
            else:
                func = registry.functions.finalize(int(payload.jobId))
                if not relayer:
                    raise _http_error(400, "RELAY_UNAVAILABLE")
                tx = _build_tx(func, relayer.address)
                txh, _receipt = await _send_relayer_tx(tx)
                response = ExecuteResponse(
                    ok=True,
                    planHash=plan_hash,
                    createdAt=created_at,
                    jobId=int(payload.jobId),
                    txHash=txh,
                    txHashes=[txh] if txh else None,
                    receiptUrl=EXPLORER_TX_TPL.format(tx=txh),
                    status="finalized",
                )
            await _attach_receipt_artifacts(response)

        elif intent.action == "check_status":
            if payload.jobId is None:
                raise _http_error(400, "JOB_ID_REQUIRED")
            status = await _read_status(int(payload.jobId))
            response = ExecuteResponse(
                ok=True,
                jobId=status.jobId,
                status=status.state,
                reward=status.reward,
                token=status.token,
                planHash=plan_hash,
                createdAt=created_at,
            )

        else:
            raise _http_error(400, "UNSUPPORTED_ACTION")

    except HTTPException as exc:
        status_code = exc.status_code
        _log_event(
            logging.WARNING,
            "onebox.execute.error",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
            mode=req.mode,
            error=exc.detail,
        )
        raise
    except Exception as exc:
        status_code = 500
        _log_event(
            logging.ERROR,
            "onebox.execute.error",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
            mode=req.mode,
            error=str(exc),
        )
        raise
    else:
        fields: Dict[str, Any] = {
            "intent_type": intent_type,
            "http_status": status_code,
            "mode": req.mode,
        }
        if response.jobId is not None:
            fields["job_id"] = response.jobId
        if response.status:
            fields["status"] = response.status
        if response.txHash:
            fields["tx_hash"] = response.txHash
        _log_event(logging.INFO, "onebox.execute.success", correlation_id, **fields)
        return response
    finally:
        duration = time.perf_counter() - start
        _EXECUTE_TOTAL.labels(intent_type=intent_type, http_status=str(status_code)).inc()
        _TTO_SECONDS.labels(endpoint="execute").observe(duration)


@router.get("/status", response_model=StatusResponse, dependencies=[Depends(require_api)])
async def status(request: Request, jobId: int):
    start = time.perf_counter()
    correlation_id = _get_correlation_id(request)
    intent_type = "status"
    status_code = 200

    try:
        result = await _read_status(jobId)
    except HTTPException as exc:
        status_code = exc.status_code
        _log_event(
            logging.WARNING,
            "onebox.status.error",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
            job_id=jobId,
            error=exc.detail,
        )
        raise
    except Exception as exc:
        status_code = 500
        _log_event(
            logging.ERROR,
            "onebox.status.error",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
            job_id=jobId,
            error=str(exc),
        )
        raise
    else:
        _log_event(
            logging.INFO,
            "onebox.status.success",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
            job_id=jobId,
            state=result.state,
        )
        return result
    finally:
        duration = time.perf_counter() - start
        _STATUS_TOTAL.labels(intent_type=intent_type, http_status=str(status_code)).inc()
        _TTO_SECONDS.labels(endpoint="status").observe(duration)


@health_router.get("/healthz", dependencies=[Depends(require_api)])
async def healthcheck(request: Request):
    correlation_id = _get_correlation_id(request)
    _log_event(
        logging.INFO,
        "onebox.healthz",
        correlation_id,
        status="ok",
    )
    return {"ok": True}


@router.get("/metrics")
def metrics_endpoint():
    payload = prometheus_client.generate_latest(_METRICS_REGISTRY)
    return Response(payload, media_type=prometheus_client.CONTENT_TYPE_LATEST)


__all__ = [
    "Action",
    "Attachment",
    "ExecuteRequest",
    "ExecuteResponse",
    "JobIntent",
    "Payload",
    "PlanRequest",
    "PlanResponse",
    "SimulateRequest",
    "SimulateResponse",
    "StatusResponse",
    "_calculate_deadline_timestamp",
    "_compute_spec_hash",
    "_decode_job_created",
    "_naive_parse",
    "execute",
    "health_router",
    "healthcheck",
    "metrics_endpoint",
    "plan",
    "simulate",
    "status",
    "_UINT64_MAX",
    "_read_status",
]
