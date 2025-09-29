# routes/onebox.py
# FastAPI router for a Web3-only, walletless-by-default "one-box" UX.
# Exposes: POST /onebox/plan, POST /onebox/simulate, POST /onebox/execute, GET /onebox/status,
# plus /healthz and /onebox/metrics (Prometheus).
# This orchestrator intelligently plans, simulates, and executes blockchain job transactions,
# ensuring all steps are validated and recorded for transparency and compliance.

import hashlib
import json
import logging
import os
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, List, Literal, Optional, Tuple

import httpx
import prometheus_client
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from web3 import Web3
from web3._utils.events import get_event_data
try:
    from web3.middleware import geth_poa_middleware
except ImportError:  # pragma: no cover - compatibility shim for newer web3 versions
    from web3.middleware.proof_of_authority import (
        ExtraDataToPOAMiddleware as geth_poa_middleware,
    )

# API router setup
router = APIRouter(prefix="/onebox", tags=["onebox"])
health_router = APIRouter(tags=["health"])

# ---------- Settings & Environment ----------
RPC_URL = os.getenv("RPC_URL", "")
CHAIN_ID = int(os.getenv("CHAIN_ID", "0") or "0")
JOB_REGISTRY = Web3.to_checksum_address(os.getenv("JOB_REGISTRY", "0x" + "0"*40))
AGIALPHA_TOKEN = Web3.to_checksum_address(os.getenv("AGIALPHA_TOKEN", "0x" + "0"*40))
AGIALPHA_DECIMALS = int(os.getenv("AGIALPHA_DECIMALS", "18") or "18")

# Path for organization policy config
_DEFAULT_POLICY_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "storage", "org-policies.json")
)

# Relayer and API authentication
_RELAYER_PK = os.getenv("ONEBOX_RELAYER_PRIVATE_KEY") or os.getenv("RELAYER_PK", "")
_API_TOKEN = os.getenv("ONEBOX_API_TOKEN") or os.getenv("API_TOKEN", "")

# Explorer template for TX links (for receipts)
EXPLORER_TX_TPL = os.getenv(
    "ONEBOX_EXPLORER_TX_BASE",
    os.getenv("EXPLORER_TX_TPL", "https://explorer.example/tx/{tx}")
)

# IPFS pinning configuration
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
    raise RuntimeError("RPC_URL is required")  # Hard requirement for blockchain connectivity


def _parse_default_max_budget() -> Optional[int]:
    raw_value = os.getenv("ORG_MAX_BUDGET_WEI")
    if not raw_value:
        return None
    try:
        parsed = int(raw_value)
    except (TypeError, ValueError):
        logging.warning("Invalid ORG_MAX_BUDGET_WEI value: %s", raw_value)
        return None
    return parsed if parsed > 0 else None


def _parse_default_max_duration() -> Optional[int]:
    raw_value = os.getenv("ORG_MAX_DEADLINE_DAYS")
    if not raw_value:
        return None
    try:
        parsed = int(raw_value)
    except (TypeError, ValueError):
        logging.warning("Invalid ORG_MAX_DEADLINE_DAYS value: %s", raw_value)
        return None
    return parsed if parsed > 0 else None


_UINT64_MAX = 2**64 - 1

# Minimal ABI (function definitions required for interacting with the JobRegistry contract)
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
        # JobCreated event for reading jobId in receipts
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
        "name": "lastJobId",
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
            {"internalType": "uint8",   "name": "state", "type": "uint8"},
            {"internalType": "bool",   "name": "active", "type": "bool"},
            {"internalType": "uint256", "name": "createdAt", "type": "uint256"},
            {"internalType": "uint256", "name": "deadline", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]

# Web3 setup
w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 30}))
# If connected to a PoA chain (like some testnets), inject middleware
try:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
except ValueError:
    pass

# If a relayer private key is provided, set up account for signing transactions
relayer = None
if _RELAYER_PK:
    try:
        relayer = w3.eth.account.from_key(_RELAYER_PK)
    except Exception as e:
        logging.error("Failed to load relayer key: %s", str(e))
        relayer = None

# Contract instance for JobRegistry
registry = w3.eth.contract(address=JOB_REGISTRY, abi=_MIN_ABI)

# Utility to require API token if set
def require_api(auth: Optional[str] = Header(None, alias="Authorization")):
    """Dependency to enforce API token authentication for onebox routes."""
    if not _API_TOKEN:
        return  # No token required if not set
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"code": "AUTH_MISSING", "message": _ERRORS["AUTH_MISSING"]})
    token = auth.split(" ", 1)[1].strip()
    if token != _API_TOKEN:
        raise HTTPException(status_code=401, detail={"code": "AUTH_INVALID", "message": _ERRORS["AUTH_INVALID"]})

logger = logging.getLogger(__name__)

# ---------- Metrics ----------
# Prometheus metrics to monitor the orchestrator's performance
_PLAN_TOTAL = prometheus_client.Counter(
    "plan_total", "Total /onebox/plan requests", ["intent_type", "http_status"]
)
_EXECUTE_TOTAL = prometheus_client.Counter(
    "execute_total", "Total /onebox/execute requests", ["intent_type", "http_status"]
)
_SIMULATE_TOTAL = prometheus_client.Counter(
    "simulate_total", "Total /onebox/simulate requests", ["intent_type", "http_status"]
)
_TTO_SECONDS = prometheus_client.Histogram(
    "onebox_tto_seconds", "Onebox endpoint turnaround time (seconds)", ["endpoint"]
)

# ---------- Data Models ----------
class Attachment(BaseModel):
    """Represents an attachment to a job (e.g., a file or link)."""
    uri: str
    name: Optional[str] = None
    type: Optional[str] = None

class JobPayload(BaseModel):
    """Represents the details of a job for posting or interacting."""
    title: Optional[str] = None
    description: Optional[str] = None
    attachments: List[Attachment] = Field(default_factory=list)
    rewardToken: Optional[str] = None
    reward: Optional[str] = None  # using string for flexibility in numeric input
    deadlineDays: Optional[int] = None
    agentTypes: List[str] = Field(default_factory=list)
    jobId: Optional[int] = None  # for job-specific actions (finalize, check_status, etc.)

# Backwards compatibility alias for older imports and tests.
Payload = JobPayload

class JobIntent(BaseModel):
    """Encapsulates a user intent extracted from natural language."""
    action: str
    payload: JobPayload
    userContext: Optional[Dict[str, Any]] = None  # context (like identity info)

class PlanRequest(BaseModel):
    """Request model for the planner (natural language input)."""
    text: str

class PlanResponse(BaseModel):
    """Response model for the planner, providing a structured intent and summary."""
    summary: str
    intent: JobIntent
    requiresConfirmation: bool = True
    warnings: List[str] = Field(default_factory=list)
    planHash: str
    missingFields: List[str] = Field(default_factory=list)

class SimulateRequest(BaseModel):
    """Request model for simulation, containing the intent to simulate."""
    intent: JobIntent
    planHash: Optional[str] = None
    createdAt: Optional[str] = None

class SimulateResponse(BaseModel):
    """Response model for simulation, detailing the plan's viability."""
    summary: str
    intent: JobIntent
    risks: List[str] = Field(default_factory=list)
    blockers: List[str] = Field(default_factory=list)
    planHash: str
    createdAt: str

class ExecuteRequest(BaseModel):
    """Request model for execution, with mode (relayer or wallet) and intent."""
    intent: JobIntent
    planHash: Optional[str] = None
    createdAt: Optional[str] = None
    mode: Literal["relayer", "wallet"] = "relayer"

class ExecuteResponse(BaseModel):
    """Response model for execution results or transaction preparation."""
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
    to: Optional[str] = None       # For wallet mode: transaction 'to' address
    data: Optional[str] = None     # For wallet mode: transaction 'data' payload
    value: Optional[str] = None    # For wallet mode: transaction 'value' (usually "0x0")
    chainId: Optional[int] = None  # For wallet mode: chain ID for the transaction
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
    """Response model for job status queries."""
    jobId: int
    state: Literal["open", "assigned", "completed", "finalized", "unknown", "disputed"] = "unknown"
    reward: Optional[str] = None
    token: Optional[str] = None
    deadline: Optional[int] = None
    assignee: Optional[str] = None

# ---------- Error Handling ----------
_ERRORS = {
    # User-facing error codes and messages for common issues
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
    "JOB_ALREADY_FINALIZED": "That job is already finalized. Choose a different job or request a status update.",
    "JOB_IN_DISPUTE": "That job is currently disputed. Resolve the dispute before finalizing.",
    "JOB_NOT_READY_FOR_FINALIZE": "This job is still in progress. Wait until it is completed before finalizing.",
    "STATUS_UNKNOWN": "I couldn’t confirm the job status. Retry once the network responds.",
    "PLAN_HASH_REQUIRED": "Send the plan hash from the planning step so I can link this request to its original plan.",
    "PLAN_HASH_INVALID": "Use the 32-byte plan hash from the planning step before continuing.",
    "PLAN_HASH_MISMATCH": "The plan hash doesn’t match this request. Re-run planning and retry.",
    "UNSUPPORTED_ACTION": "I didn’t understand that action. Rephrase the request or choose a supported workflow.",
    "UNKNOWN": "Something went wrong on my side. I’ve logged it and you can retry once things settle down.",
}


def _error_detail(code: str) -> Dict[str, str]:
    """Build a standardized error detail dict from an error code."""
    message = _ERRORS.get(code)
    if message is None:
        message = f"Something went wrong. Reference code {code} when contacting support."
    return {"code": code, "message": message}


def _http_error(status_code: int, code: str) -> HTTPException:
    """Helper to raise HTTPException with our standardized error response."""
    return HTTPException(status_code, _error_detail(code))


# ---------- Helper Functions ----------
_SUMMARY_SUFFIX = " Proceed?"


def _ensure_summary_limit(value: str) -> str:
    if len(value) <= 140:
        return value
    base = re.sub(r"\s*Proceed\?$", "", value)
    truncated = base[: max(0, 140 - len(_SUMMARY_SUFFIX) - 1)].rstrip()
    return f"{truncated}…{_SUMMARY_SUFFIX}"


def _format_percentage(value: Decimal) -> str:
    """Format Decimal percentage as a string without trailing zeros (e.g., Decimal('2.00') -> '2')."""
    quantized = value.normalize()
    text = format(quantized, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _format_reward(value_wei: int) -> str:
    """Format a token amount in wei into a human-readable token amount string with decimals."""
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
    """Convert a human-readable token amount string to wei (int) based on AGIALPHA_DECIMALS."""
    try:
        decimal_value = Decimal(amount_str)
    except InvalidOperation:
        raise _http_error(400, "REWARD_INVALID")
    if decimal_value < 0:
        raise _http_error(400, "INSUFFICIENT_BALANCE")
    precision = Decimal(10) ** AGIALPHA_DECIMALS
    wei_value = int((decimal_value * precision).to_integral_value(rounding=ROUND_HALF_UP))
    return wei_value


@dataclass
class OrgPolicyRecord:
    """Record of an organisation's job policy limits."""
    max_budget_wei: Optional[int] = None
    max_duration_days: Optional[int] = None
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class OrgPolicyViolation(Exception):
    """Custom exception for violations of organisational policies."""

    def __init__(self, code: str, message: str, record: OrgPolicyRecord) -> None:
        super().__init__(message)
        self.code = code
        self.record = record

    def to_http_exception(self) -> HTTPException:
        """Convert this violation to an HTTPException with appropriate detail."""
        return HTTPException(status_code=400, detail=_error_detail(self.code))


class OrgPolicyStore:
    """Stores and enforces budget/deadline policies for organisations."""

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

    def _resolve_key(self, org_id: Optional[str]) -> str:
        return str(org_id or "__default__")

    def _load(self) -> None:
        """Load policies from a JSON file if it exists."""
        try:
            with open(self._policy_path, "r") as f:
                data = json.load(f)
        except FileNotFoundError:
            data = {}
            if (
                self._default_max_budget_wei is not None
                or self._default_max_duration_days is not None
            ):
                data["__default__"] = {
                    "maxBudgetWei": self._default_max_budget_wei,
                    "maxDurationDays": self._default_max_duration_days,
                }
        default_budget = self._default_max_budget_wei
        default_duration = self._default_max_duration_days

        for key, value in data.items():
            if not isinstance(value, dict):
                logging.warning("Invalid policy entry for %s: expected dict, got %r", key, value)
                continue

            record = OrgPolicyRecord()

            stored_budget = value.get("maxBudgetWei")
            if stored_budget is None or stored_budget == "":
                record.max_budget_wei = default_budget
            elif isinstance(stored_budget, str):
                try:
                    record.max_budget_wei = int(stored_budget)
                except ValueError:
                    logging.warning("Invalid maxBudgetWei for %s: %r", key, stored_budget)
                    record.max_budget_wei = default_budget
            elif isinstance(stored_budget, (int, float)):
                record.max_budget_wei = int(stored_budget)
            else:
                logging.warning("Unsupported maxBudgetWei type for %s: %r", key, type(stored_budget))
                record.max_budget_wei = default_budget

            stored_duration = value.get("maxDurationDays")
            if stored_duration is None or stored_duration == "":
                record.max_duration_days = default_duration
            elif isinstance(stored_duration, (int, float, str)):
                try:
                    record.max_duration_days = int(stored_duration)
                except (TypeError, ValueError):
                    logging.warning("Invalid maxDurationDays for %s: %r", key, stored_duration)
                    record.max_duration_days = default_duration
            else:
                logging.warning(
                    "Unsupported maxDurationDays type for %s: %r", key, type(stored_duration)
                )
                record.max_duration_days = default_duration

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

    def enforce(self, org_id: Optional[str], reward_wei: int, deadline_days: int) -> OrgPolicyRecord:
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
            return record

    def update(self, org_id: Optional[str], max_budget_wei: Optional[int], max_duration_days: Optional[int]) -> None:
        with self._lock:
            key = self._resolve_key(org_id)
            record = self._get_or_create(org_id)
            record.max_budget_wei = max_budget_wei
            record.max_duration_days = max_duration_days
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
                        }
                        for k, v in self._policies.items()
                    }
                    json.dump(data, f, indent=2)
            except Exception as e:
                logging.error("Failed to persist org policy update: %s", e)


_ORG_POLICY_STORE: Optional[OrgPolicyStore] = None
_ORG_POLICY_LOCK = threading.Lock()

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


def _get_correlation_id(request: Request) -> str:
    return request.headers.get("X-Request-ID") or str(uuid.uuid4())


def _calculate_deadline_timestamp(days: int) -> int:
    now = datetime.now(timezone.utc)
    target = now + timedelta(days=days)
    eod = target.replace(hour=23, minute=59, second=59, microsecond=0)
    return int(eod.timestamp())


def _compute_plan_hash(intent: JobIntent) -> str:
    intent_data = intent.dict(exclude={"userContext"}, by_alias=True)
    encoded = json.dumps(intent_data, sort_keys=True).encode("utf-8")
    h = hashlib.sha256()
    h.update(encoded)
    return h.hexdigest()


def _normalize_plan_hash(plan_hash: Optional[str]) -> str:
    if plan_hash is None:
        raise ValueError("plan hash missing")
    hash_str = str(plan_hash).strip().lower()
    if not hash_str:
        raise ValueError("plan hash empty")
    if not re.fullmatch(r"[0-9a-f]{64}", hash_str):
        raise ValueError("plan hash invalid")
    return hash_str


def _current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


_PLAN_METADATA: Dict[str, str] = {}
_PLAN_LOCK = threading.Lock()


def _store_plan_metadata(plan_hash: str, created_at: str) -> None:
    with _PLAN_LOCK:
        _PLAN_METADATA[plan_hash] = created_at


def _lookup_plan_timestamp(plan_hash: str) -> Optional[str]:
    with _PLAN_LOCK:
        return _PLAN_METADATA.get(plan_hash)


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


def _summary_for_intent(intent: JobIntent, request_text: str) -> Tuple[str, bool, List[str]]:
    warnings: List[str] = []
    request_snippet = request_text.strip()
    snippet = f" ({request_snippet})" if request_snippet else ""
    summary = ""
    requires_confirmation = True

    if intent.action == "finalize_job":
        jid = intent.payload.jobId
        summary = f"Detected request to finalize job #{jid}.{snippet}".rstrip(".") + "."
        return _ensure_summary_limit(summary), True, warnings
    if intent.action == "check_status":
        jid = intent.payload.jobId
        summary = f"Detected job status request for job #{jid}.{snippet}".rstrip(".") + "."
        return summary, False, warnings
    if intent.action == "stake":
        jid = intent.payload.jobId
        summary = f"Detected request to stake on job #{jid}.{snippet}".rstrip(".") + "."
        return _ensure_summary_limit(summary), True, warnings
    if intent.action == "validate":
        jid = intent.payload.jobId
        summary = f"Detected request to validate job #{jid}.{snippet}".rstrip(".") + "."
        return _ensure_summary_limit(summary), True, warnings
    if intent.action == "dispute":
        jid = intent.payload.jobId
        summary = f"Detected request to dispute job #{jid}.{snippet}".rstrip(".") + "."
        return _ensure_summary_limit(summary), True, warnings

    payload = intent.payload
    reward = payload.reward
    deadline = payload.deadlineDays
    title = payload.title or "New Job"
    default_reward_applied = False
    default_deadline_applied = False
    if reward is None or (isinstance(reward, str) and not str(reward).strip()):
        reward = "1.0"
        default_reward_applied = True
    if deadline is None:
        deadline = 7
        default_deadline_applied = True

    try:
        reward_val = Decimal(str(reward))
    except Exception:
        reward_val = None
    reward_str = f"{reward} {AGIALPHA_SYMBOL}" if reward_val is not None else f"{reward} (invalid)"
    deadline_str = f"{deadline} day{'s' if str(deadline) != '1' else ''}"
    summary = (
        f"Detected request to post a job '{title}' with reward {reward_str}, deadline {deadline_str}.{snippet}".rstrip(".")
        + "."
    )
    fee_pct, burn_pct = _get_fee_policy()
    if fee_pct is not None and burn_pct is not None:
        summary = summary.rstrip(".") + f" Protocol fee {fee_pct}%, burn {burn_pct}% of reward. Proceed?"
    else:
        summary = summary.rstrip(".") + " Proceed?"

    if default_reward_applied:
        warnings.append("DEFAULT_REWARD_APPLIED")
    if default_deadline_applied:
        warnings.append("DEFAULT_DEADLINE_APPLIED")

    return _ensure_summary_limit(summary), True, warnings


def _get_fee_policy() -> Tuple[Optional[str], Optional[str]]:
    try:
        burn_pct_uint = registry.functions.burnPct().call()
        burn_pct_dec = Decimal(burn_pct_uint) / Decimal(100)
        fee_pct_dec = Decimal(2)
        return _format_percentage(fee_pct_dec), _format_percentage(burn_pct_dec)
    except Exception:
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


def _resolve_org_identifier(intent: JobIntent) -> Optional[str]:
    ctx = intent.userContext or {}
    org = ctx.get("org") or ctx.get("organisation") or ctx.get("organization")
    if org:
        return str(org)
    return None


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

    return providers


async def _pin_json(data: dict, file_name: str) -> dict:
    providers = _resolve_pinners()
    if not providers:
        raise PinningError("No pinning providers configured", provider="none")
    errors = []
    for provider in providers:
        url = _ensure_upload_url(provider.endpoint, provider.name)
        headers = _build_auth_headers(provider.name, provider.token)
        try:
            files = {"file": (file_name, json.dumps(data), "application/json")}
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
                else:
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


async def _send_relayer_tx(tx: dict) -> Tuple[str, dict]:
    if not relayer:
        raise _http_error(400, "RELAY_UNAVAILABLE")
    signed = relayer.sign_transaction(tx)
    txh = w3.eth.send_raw_transaction(signed.rawTransaction).hex()
    receipt = w3.eth.wait_for_transaction_receipt(txh, timeout=180)
    return txh, dict(receipt)


def _require_sender(intent: Optional[JobIntent]) -> str:
    """Resolve the sender address for relayer transactions or raise a clear error."""

    relayer_sender = getattr(relayer, "address", None) if relayer else None
    if relayer_sender:
        return relayer_sender

    user_context = getattr(intent, "userContext", None) if intent else None
    sender: Optional[str] = None
    if isinstance(user_context, dict):
        sender = (user_context or {}).get("sender")

    if sender:
        return sender

    detail = _error_detail("RELAY_UNAVAILABLE")
    detail["reason"] = "MISSING_SENDER"
    detail["hint"] = "No relayer configured and no userContext.sender was provided."
    raise HTTPException(400, detail)


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
    response: ExecuteResponse,
    plan_hash: Optional[str],
    created_at: Optional[str],
    tx_hashes: List[str],
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


@router.post("/plan", response_model=PlanResponse, dependencies=[Depends(require_api)])
async def plan(request: Request, req: PlanRequest):
    """
    Planner endpoint: Parses a natural-language job request into a JobIntent and summary.
    Returns a plan with intent, summary, potential warnings, missing fields, and a planHash.
    """
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
        _log_event(logging.INFO, "onebox.plan.success", correlation_id, intent_type=intent_type)
        return response

    except HTTPException as exc:
        status_code = exc.status_code
        detail = getattr(exc, "detail", None)
        log_fields = {"intent_type": intent_type, "http_status": status_code}
        if detail and isinstance(detail, dict) and detail.get("code"):
            log_fields["error"] = detail["code"]
        _log_event(logging.WARNING, "onebox.plan.failed", correlation_id, **log_fields)
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
    finally:
        duration = time.perf_counter() - start
        _PLAN_TOTAL.labels(intent_type=intent_type, http_status=str(status_code)).inc()
        _TTO_SECONDS.labels(endpoint="plan").observe(duration)


@router.post("/simulate", response_model=SimulateResponse, dependencies=[Depends(require_api)])
async def simulate(request: Request, req: SimulateRequest):
    """Simulator endpoint: Validates a planned JobIntent against policies and current on-chain state."""
    start = time.perf_counter()
    correlation_id = _get_correlation_id(request)
    intent = req.intent
    payload = intent.payload
    intent_type = intent.action if intent and intent.action else "unknown"
    status_code = 200

    raw_plan_hash = req.planHash
    if raw_plan_hash is None or not str(raw_plan_hash).strip():
        raise _http_error(400, "PLAN_HASH_REQUIRED")
    try:
        provided_hash = _normalize_plan_hash(raw_plan_hash)
    except ValueError:
        raise _http_error(400, "PLAN_HASH_INVALID")
    canonical_hash = _compute_plan_hash(intent)
    if provided_hash != canonical_hash:
        raise _http_error(400, "PLAN_HASH_MISMATCH")
    plan_hash = provided_hash

    stored_created_at = _lookup_plan_timestamp(plan_hash)
    request_created_at = (
        _current_timestamp()
        if not req.createdAt
        else _current_timestamp()
        if not str(req.createdAt).strip()
        else str(req.createdAt)
    )
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

            if reward_value is None or (isinstance(reward_value, str) and not str(reward_value).strip()):
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
                        reward_wei = int((reward_decimal * precision).to_integral_value(rounding=ROUND_HALF_UP))

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

        elif intent.action == "finalize_job":
            job_identifier = getattr(payload, "jobId", None)
            if job_identifier is None:
                blockers.append("JOB_ID_REQUIRED")
            else:
                try:
                    job_id_int = int(job_identifier)
                except (TypeError, ValueError):
                    blockers.append("JOB_ID_REQUIRED")
                else:
                    status = await _read_status(job_id_int)
                    state = status.state or "unknown"
                    if state == "finalized":
                        blockers.append("JOB_ALREADY_FINALIZED")
                    elif state == "disputed":
                        blockers.append("JOB_IN_DISPUTE")
                    elif state not in {"completed", "unknown"}:
                        if "JOB_NOT_READY_FOR_FINALIZE" not in risks:
                            risks.append("JOB_NOT_READY_FOR_FINALIZE")
                    if state == "unknown" and "STATUS_UNKNOWN" not in risks:
                        risks.append("STATUS_UNKNOWN")

        elif intent.action == "check_status":
            if getattr(payload, "jobId", None) is None:
                blockers.append("JOB_ID_REQUIRED")

        elif intent.action in {"stake", "validate", "dispute"}:
            blockers.append("UNSUPPORTED_ACTION")
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
        detail = getattr(exc, "detail", None)
        log_fields: Dict[str, Any] = {"intent_type": intent_type, "http_status": status_code}
        if status_code == 422 and isinstance(detail, dict):
            blockers_detail = detail.get("blockers")
            if isinstance(blockers_detail, list):
                log_fields["blockers"] = ",".join(blockers_detail)
            risks_detail = detail.get("risks")
            if isinstance(risks_detail, list) and risks_detail:
                log_fields["risks"] = ",".join(risks_detail)
            _log_event(logging.WARNING, "onebox.simulate.blocked", correlation_id, **log_fields)
        else:
            log_fields["error"] = detail if detail else "UNKNOWN_ERROR"
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
        log_fields: Dict[str, Any] = {"intent_type": intent_type, "http_status": status_code}
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
    """Runner endpoint: Executes a previously planned intent via relayer or wallet mode."""
    start = time.perf_counter()
    correlation_id = _get_correlation_id(request)
    intent = req.intent
    payload = intent.payload
    intent_type = intent.action if intent and intent.action else "unknown"
    status_code = 200

    raw_plan_hash = req.planHash
    if raw_plan_hash is None or not str(raw_plan_hash).strip():
        raise _http_error(400, "PLAN_HASH_REQUIRED")
    try:
        provided_hash = _normalize_plan_hash(raw_plan_hash)
    except ValueError:
        raise _http_error(400, "PLAN_HASH_INVALID")
    canonical_hash = _compute_plan_hash(intent)
    if provided_hash != canonical_hash:
        raise _http_error(400, "PLAN_HASH_MISMATCH")
    plan_hash = provided_hash

    stored_created_at = _lookup_plan_timestamp(plan_hash)
    request_created_at = (
        _current_timestamp()
        if not req.createdAt
        else _current_timestamp()
        if not str(req.createdAt).strip()
        else str(req.createdAt)
    )
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
                policy_record = _get_org_policy_store().enforce(org_identifier, reward_wei, deadline_days)
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
                _log_event(logging.INFO, "onebox.policy.accepted", correlation_id, **log_fields)

            deadline_ts = _calculate_deadline_timestamp(deadline_days)
            fee_pct, burn_pct = _get_fee_policy()
            fee_amount, burn_amount = _calculate_fee_amounts(
                str(payload.reward), Decimal(fee_pct or "0"), Decimal(burn_pct or "0")
            )
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
                to, data = _encode_wallet_call("postJob", [uri, AGIALPHA_TOKEN, reward_wei, deadline_days])
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
                    token=payload.rewardToken or AGIALPHA_SYMBOL,
                    status="prepared",
                    feePct=float(fee_pct) if fee_pct is not None else None,
                    burnPct=float(burn_pct) if burn_pct is not None else None,
                    feeAmount=fee_amount,
                    burnAmount=burn_amount,
                )
            else:
                func = registry.functions.postJob(uri, AGIALPHA_TOKEN, reward_wei, deadline_days)
                sender = _require_sender(intent)
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
                    token=payload.rewardToken or AGIALPHA_SYMBOL,
                    status="submitted",
                    feePct=float(fee_pct) if fee_pct is not None else None,
                    burnPct=float(burn_pct) if burn_pct is not None else None,
                    feeAmount=fee_amount,
                    burnAmount=burn_amount,
                )
        elif intent.action == "finalize_job":
            if payload.jobId is None:
                raise _http_error(400, "JOB_ID_REQUIRED")
            try:
                job_id_int = int(payload.jobId)
            except (TypeError, ValueError):
                raise _http_error(400, "JOB_ID_REQUIRED")
            if req.mode == "wallet":
                to, data = _encode_wallet_call("finalize", [job_id_int])
                response = ExecuteResponse(
                    ok=True,
                    planHash=plan_hash,
                    createdAt=created_at,
                    to=to,
                    data=data,
                    value="0x0",
                    chainId=CHAIN_ID,
                    status="prepared",
                )
            else:
                func = registry.functions.finalize(job_id_int)
                sender = _require_sender(intent)
                tx = _build_tx(func, sender)
                txh, receipt = await _send_relayer_tx(tx)
                response = ExecuteResponse(
                    ok=True,
                    planHash=plan_hash,
                    createdAt=created_at,
                    jobId=job_id_int,
                    txHash=txh,
                    txHashes=[txh] if txh else None,
                    receiptUrl=EXPLORER_TX_TPL.format(tx=txh),
                    status="submitted",
                )
        else:
            raise _http_error(400, "UNSUPPORTED_ACTION")

        if req.mode != "wallet":
            await _attach_receipt_artifacts(response)
            response.status = response.status or "completed"
        else:
            response.status = response.status or "prepared"

        response.ok = True
        _log_event(logging.INFO, "onebox.execute.success", correlation_id, intent_type=intent_type)
        return response

    except HTTPException as exc:
        status_code = exc.status_code
        detail = getattr(exc, "detail", None)
        log_fields = {"intent_type": intent_type, "http_status": status_code}
        if detail and isinstance(detail, dict) and detail.get("code"):
            log_fields["error"] = detail["code"]
        _log_event(logging.WARNING, "onebox.execute.failed", correlation_id, **log_fields)
        raise
    except Exception as exc:
        status_code = 500
        _log_event(
            logging.ERROR,
            "onebox.execute.error",
            correlation_id,
            intent_type=intent_type,
            http_status=status_code,
            error=str(exc),
        )
        raise
    finally:
        duration = time.perf_counter() - start
        _EXECUTE_TOTAL.labels(intent_type=intent_type, http_status=str(status_code)).inc()
        _TTO_SECONDS.labels(endpoint="execute").observe(duration)


@router.get("/status", response_model=StatusResponse, dependencies=[Depends(require_api)])
async def status(request: Request, jobId: int):
    """Retrieve on-chain status for a given job ID."""
    correlation_id = _get_correlation_id(request)
    intent_type = "check_status"
    job_id = jobId

    try:
        job = registry.functions.jobs(job_id).call()
    except Exception as e:
        logger.error("Job status retrieval failed for job %s: %s", job_id, e)
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
    if agent and int(agent, 16) != 0:
        assignee = Web3.to_checksum_address(agent)
    reward_str = _format_reward(reward) if reward is not None else None
    state_label = _STATE_MAP.get(state_code, "unknown")
    state_output = (
        "disputed"
        if state_label == "disputed"
        else state_label if state_label in {"open", "assigned", "completed", "finalized"} else "unknown"
    )

    response = StatusResponse(
        jobId=int(job_id),
        state=state_output,
        reward=reward_str,
        token=AGIALPHA_TOKEN,
        deadline=deadline,
        assignee=assignee,
    )
    _log_event(logging.INFO, "onebox.status.success", correlation_id, intent_type=intent_type)
    return response


_STATE_MAP = {
    0: "draft",
    1: "open",
    2: "assigned",
    3: "review",
    4: "completed",
    5: "disputed",
    6: "finalized",
}


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
    if not isinstance(data, str):
        raise _http_error(500, "UNKNOWN")
    return registry.address, data


def _decode_job_created(receipt: Dict[str, Any]) -> Optional[int]:
    try:
        logs = receipt.get("logs") or []
        for log in logs:
            if not isinstance(log, dict):
                continue
            if log.get("address", "").lower() != registry.address.lower():
                continue
            topics = log.get("topics")
            if not topics:
                continue
            event_abi = next((item for item in _MIN_ABI if item.get("type") == "event" and item.get("name") == "JobCreated"), None)
            if not event_abi:
                continue
            event = get_event_data(w3.codec, event_abi, log)
            job_id = event["args"].get("jobId")
            if job_id is not None:
                return int(job_id)
    except Exception as exc:
        logger.warning("Failed to decode JobCreated event: %s", exc)
    return None


async def _read_status(job_id: int) -> StatusResponse:
    try:
        job = registry.functions.jobs(job_id).call()
    except Exception:
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
    assignee = None
    if agent and int(agent, 16) != 0:
        assignee = Web3.to_checksum_address(agent)
    reward_str = _format_reward(reward) if reward is not None else None
    state_label = _STATE_MAP.get(state_code, "unknown")
    state_output = (
        "disputed"
        if state_label == "disputed"
        else state_label if state_label in {"open", "assigned", "completed", "finalized"} else "unknown"
    )
    return StatusResponse(
        jobId=job_id,
        state=state_output,
        reward=reward_str,
        token=AGIALPHA_TOKEN,
        deadline=deadline,
        assignee=assignee,
    )


def _log_event(level: int, event: str, correlation_id: str, **kwargs: Any) -> None:
    extra = {"event": event, "cid": correlation_id}
    extra.update(kwargs or {})
    logger.log(level, f"{event} | cid={correlation_id} | " + " ".join(f"{k}={v}" for k, v in kwargs.items()), extra=extra)


@health_router.get("/healthz")
async def healthz():
    try:
        _ = w3.eth.block_number
    except Exception as e:
        raise HTTPException(status_code=503, detail={"code": "RPC_UNAVAILABLE", "message": str(e)})
    return {"status": "ok"}


@health_router.get("/metrics")
def metrics():
    return Response(prometheus_client.generate_latest(), media_type=prometheus_client.CONTENT_TYPE_LATEST)


def _naive_parse(text: str) -> JobIntent:
    normalized = text.strip()
    lower = normalized.lower()
    payload = JobPayload()

    match = re.search(r"finaliz(e|ing)\s+job\s+#?(\d+)", lower)
    if match:
        payload.jobId = int(match.group(2))
        return JobIntent(action="finalize_job", payload=payload)

    match = re.search(r"status\s+(?:for|of)\s+job\s+#?(\d+)", lower)
    if match:
        payload.jobId = int(match.group(1))
        return JobIntent(action="check_status", payload=payload)

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
