"""FastAPI router exposing the AGI Jobs one-box API surface."""

from __future__ import annotations

import json
import os
import re
import time
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)
from pydantic import BaseModel, Field
from web3 import Web3
from web3.middleware import geth_poa_middleware

# ---------- Settings ----------
RPC_URL = os.getenv("RPC_URL", "")
CHAIN_ID = int(os.getenv("CHAIN_ID", "0"))
JOB_REGISTRY = Web3.to_checksum_address(
    os.getenv("JOB_REGISTRY", "0x0000000000000000000000000000000000000000")
)
AGIALPHA_TOKEN = Web3.to_checksum_address(
    os.getenv("AGIALPHA_TOKEN", "0x0000000000000000000000000000000000000000")
)
RELAYER_PK = os.getenv("RELAYER_PK", "")
API_TOKEN = os.getenv("API_TOKEN", "")
EXPLORER_TX_TPL = os.getenv("EXPLORER_TX_TPL", "https://explorer.example/tx/{tx}")
PINNER_KIND = os.getenv("PINNER_KIND", "").lower()  # pinata|web3storage|nftstorage|ipfs_http
PINNER_ENDPOINT = os.getenv("PINNER_ENDPOINT", "")
PINNER_TOKEN = os.getenv("PINNER_TOKEN", "")

_ABI_PATH = Path(__file__).with_name("job_registry.abi.json")

_DEFAULT_MIN_ABI = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "reward", "type": "uint256"},
            {"internalType": "uint64", "name": "deadline", "type": "uint64"},
            {"internalType": "bytes32", "name": "specHash", "type": "bytes32"},
            {"internalType": "string", "name": "uri", "type": "string"},
        ],
        "name": "createJob",
        "outputs": [
            {"internalType": "uint256", "name": "jobId", "type": "uint256"},
        ],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "reward", "type": "uint256"},
            {"internalType": "uint64", "name": "deadline", "type": "uint64"},
            {"internalType": "uint8", "name": "agentTypes", "type": "uint8"},
            {"internalType": "bytes32", "name": "specHash", "type": "bytes32"},
            {"internalType": "string", "name": "uri", "type": "string"},
        ],
        "name": "createJobWithAgentTypes",
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
            {"indexed": True, "internalType": "uint256", "name": "jobId", "type": "uint256"},
            {"indexed": True, "internalType": "address", "name": "employer", "type": "address"},
            {"indexed": True, "internalType": "address", "name": "agent", "type": "address"},
            {"indexed": False, "internalType": "uint256", "name": "reward", "type": "uint256"},
            {"indexed": False, "internalType": "uint256", "name": "stake", "type": "uint256"},
            {"indexed": False, "internalType": "uint256", "name": "fee", "type": "uint256"},
            {"indexed": False, "internalType": "bytes32", "name": "specHash", "type": "bytes32"},
            {"indexed": False, "internalType": "string", "name": "uri", "type": "string"},
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
]

try:
    _MIN_ABI = json.loads(_ABI_PATH.read_text())
except (FileNotFoundError, json.JSONDecodeError):
    _MIN_ABI = _DEFAULT_MIN_ABI

_ABI = json.loads(os.getenv("JOB_REGISTRY_ABI_JSON", json.dumps(_MIN_ABI)))
_UINT64_MAX = 2**64 - 1
_ZERO_ADDRESS = "0x" + "0" * 40

_STATE_TO_STATUS = {
    1: "open",
    2: "assigned",
    3: "assigned",
    4: "completed",
    6: "finalized",
}

# ---------- Web3 ----------
if not RPC_URL:
    raise RuntimeError("RPC_URL is required")

w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 45}))
try:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
except ValueError:
    pass

if CHAIN_ID and w3.eth.chain_id != CHAIN_ID:
    print(
        "[onebox] warning: connected chain",
        w3.eth.chain_id,
        "differs from configured CHAIN_ID",
        CHAIN_ID,
    )

registry = w3.eth.contract(address=JOB_REGISTRY, abi=_ABI)
relayer = w3.eth.account.from_key(RELAYER_PK) if RELAYER_PK else None

# ---------- API Router ----------
router = APIRouter(prefix="/onebox", tags=["onebox"])

_METRIC_REGISTRY = CollectorRegistry(auto_describe=True)
_PLAN_COUNTER = Counter(
    "onebox_plan_total",
    "Total number of one-box planning requests",
    ["mode", "outcome"],
    registry=_METRIC_REGISTRY,
)
_PLAN_LATENCY = Histogram(
    "onebox_plan_latency_seconds",
    "Latency for one-box planning requests",
    ["mode"],
    registry=_METRIC_REGISTRY,
)
_EXECUTE_COUNTER = Counter(
    "onebox_execute_total",
    "Total number of one-box execute requests",
    ["mode", "action", "outcome"],
    registry=_METRIC_REGISTRY,
)
_EXECUTE_LATENCY = Histogram(
    "onebox_execute_latency_seconds",
    "Latency for one-box execute requests",
    ["mode", "action"],
    registry=_METRIC_REGISTRY,
)
_STATUS_COUNTER = Counter(
    "onebox_status_total",
    "Total number of one-box status reads",
    ["outcome"],
    registry=_METRIC_REGISTRY,
)
_STATUS_LATENCY = Histogram(
    "onebox_status_latency_seconds",
    "Latency for one-box status reads",
    registry=_METRIC_REGISTRY,
)


def require_api(auth: Optional[str] = Header(None, alias="Authorization")) -> None:
    if not API_TOKEN:
        return
    if not auth or not auth.startswith("Bearer "):
        _raise("UNAUTHENTICATED", status=401)
    token = auth.split(" ", 1)[1].strip()
    if token != API_TOKEN:
        _raise("UNAUTHENTICATED", status=401)


# ---------- Models ----------
Action = Literal[
    "post_job",
    "finalize_job",
    "check_status",
    "stake",
    "dispute",
    "validate",
]


class Attachment(BaseModel):
    name: str
    ipfs: Optional[str] = None
    url: Optional[str] = None
    type: Optional[str] = None


class Payload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    attachments: List[Attachment] = Field(default_factory=list)
    rewardToken: str = "AGIALPHA"
    reward: Optional[str] = None
    deadlineDays: Optional[int] = None
    jobId: Optional[int] = None
    agentTypes: Optional[int] = Field(default=None, ge=0)


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


class ExecuteRequest(BaseModel):
    intent: JobIntent
    mode: Literal["relayer", "wallet"] = "relayer"


class ExecuteResponse(BaseModel):
    ok: bool = True
    jobId: Optional[int] = None
    txHash: Optional[str] = None
    receiptUrl: Optional[str] = None
    to: Optional[str] = None
    data: Optional[str] = None
    value: Optional[str] = None
    chainId: Optional[int] = None


class StatusResponse(BaseModel):
    jobId: int
    state: Literal["open", "assigned", "completed", "finalized", "unknown"] = "unknown"
    reward: Optional[str] = None
    token: Optional[str] = None
    deadline: Optional[int] = None
    assignee: Optional[str] = None


ERROR_MESSAGES = {
    "INSUFFICIENT_BALANCE": "You don’t have enough AGIALPHA to fund this job. Reduce the reward or top up.",
    "INSUFFICIENT_ALLOWANCE": "Your wallet needs permission to use AGIALPHA. I can prepare an approval transaction.",
    "IPFS_FAILED": "I couldn’t package your job details. Remove broken links and try again.",
    "DEADLINE_INVALID": "That deadline is in the past. Pick at least 24 hours from now.",
    "NETWORK_CONGESTED": "The network is busy; I’ll retry briefly.",
    "RELAYER_DISABLED": "Relayer is not configured. Enable it or switch to wallet mode.",
    "UNAUTHENTICATED": "Authentication is required to call this endpoint.",
    "JOB_ID_REQUIRED": "Provide the job id you want me to act on.",
    "UNKNOWN": "Something went wrong. I’ll log the details and help you try again.",
}


# ---------- Helpers ----------
def _raise(code: str, status: int = 400) -> None:
    raise HTTPException(status, detail=code)


def _to_wei(amount: str) -> int:
    return int(Decimal(amount) * (10**18))


def _normalize_title(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    return cleaned[:160] if cleaned else "New Job"


def _extract_job_id(text: str) -> Optional[int]:
    job_specific = re.search(r"job\s*(?:number|no\.?|#)?\s*(\d+)", text, re.I)
    if job_specific:
        return int(job_specific.group(1))
    generic = re.search(r"\b(\d{1,})\b", text)
    if generic:
        try:
            return int(generic.group(1))
        except ValueError:
            return None
    return None


_STATUS_KEYWORDS = (
    "status",
    "state",
    "progress",
    "update",
    "check",
    "checking",
)


_FINALIZE_KEYWORDS = (
    "finalize",
    "finalise",
    "finalized",
    "finalised",
    "complete",
    "completed",
    "completion",
    "finish",
    "finished",
    "close",
    "closing",
    "wrap up",
    "wrap-up",
    "wrapup",
)

_STAKE_KEYWORDS = (
    "stake",
    "staking",
    "stake on",
    "bond",
    "bonding",
    "collateral",
    "post stake",
    "add stake",
)

_VALIDATE_KEYWORDS = (
    "validate",
    "validation",
    "validator",
    "approve",
    "approval",
    "confirm",
    "confirmation",
    "verify",
    "verification",
)

_DISPUTE_KEYWORDS = (
    "dispute",
    "disputing",
    "challenge",
    "challenging",
    "contest",
    "contesting",
    "appeal",
    "appealing",
    "flag",
    "flagging",
)


def _contains_keyword(lowered: str, keywords: Tuple[str, ...]) -> bool:
    for keyword in keywords:
        if " " in keyword:
            if keyword in lowered:
                return True
        else:
            if re.search(rf"\b{re.escape(keyword)}\b", lowered):
                return True
    return False


def _looks_like_status_request(text: str, job_id: Optional[int]) -> bool:
    lowered = text.lower()
    if not _contains_keyword(lowered, _STATUS_KEYWORDS):
        return False
    prefixes = tuple(keyword for keyword in ("status", "state", "check") if keyword)
    return "job" in lowered or job_id is not None or lowered.startswith(prefixes)


def _looks_like_finalize_request(text: str, job_id: Optional[int]) -> bool:
    lowered = text.lower()
    if not _contains_keyword(lowered, _FINALIZE_KEYWORDS):
        return False
    return "job" in lowered or job_id is not None


def _looks_like_stake_request(text: str, job_id: Optional[int]) -> bool:
    lowered = text.lower()
    if not _contains_keyword(lowered, _STAKE_KEYWORDS):
        return False
    return "job" in lowered or job_id is not None


def _looks_like_validate_request(text: str, job_id: Optional[int]) -> bool:
    lowered = text.lower()
    if not _contains_keyword(lowered, _VALIDATE_KEYWORDS):
        return False
    return "job" in lowered or job_id is not None


def _looks_like_dispute_request(text: str, job_id: Optional[int]) -> bool:
    lowered = text.lower()
    if not _contains_keyword(lowered, _DISPUTE_KEYWORDS):
        return False
    return "job" in lowered or job_id is not None


def _naive_parse(text: str) -> JobIntent:
    trimmed = text.strip()
    job_id = _extract_job_id(trimmed)

    if _looks_like_status_request(trimmed, job_id):
        return JobIntent(action="check_status", payload=Payload(jobId=job_id))

    if _looks_like_finalize_request(trimmed, job_id):
        return JobIntent(action="finalize_job", payload=Payload(jobId=job_id))

    if _looks_like_stake_request(trimmed, job_id):
        return JobIntent(action="stake", payload=Payload(jobId=job_id))

    if _looks_like_validate_request(trimmed, job_id):
        return JobIntent(action="validate", payload=Payload(jobId=job_id))

    if _looks_like_dispute_request(trimmed, job_id):
        return JobIntent(action="dispute", payload=Payload(jobId=job_id))

    amount_match = re.search(r"(\d+(?:\.\d+)?)\s*agi(?:alpha)?", trimmed, re.I)
    days_match = re.search(r"(\d+)\s*(?:d|day|days)", trimmed, re.I)
    reward = amount_match.group(1) if amount_match else "1.0"
    deadline = int(days_match.group(1)) if days_match else 7
    title = _normalize_title(trimmed)
    return JobIntent(
        action="post_job",
        payload=Payload(title=title, reward=reward, deadlineDays=deadline),
    )


def _encode_wallet_call(func_name: str, args: List[Any]) -> Tuple[str, str]:
    data = registry.encodeABI(fn_name=func_name, args=args)
    return registry.address, data


def _decode_job_created(receipt: Dict[str, Any]) -> Optional[int]:
    try:
        events = registry.events.JobCreated().process_receipt(receipt)
        if events:
            job_id = events[-1]["args"].get("jobId")
            if job_id is not None:
                return int(job_id)
    except Exception:
        pass
    try:
        return int(registry.functions.lastJobId().call())
    except Exception:
        return None


def _build_tx(func, sender: str) -> Dict[str, Any]:
    nonce = w3.eth.get_transaction_count(sender)
    try:
        gas = func.estimate_gas({"from": sender})
    except Exception:
        gas = 300_000
    tx = func.build_transaction({"from": sender, "nonce": nonce, "chainId": CHAIN_ID, "gas": gas})
    try:
        pending = w3.eth.get_block("pending")
        base = pending.get("baseFeePerGas")
        priority = w3.eth.max_priority_fee
        if base is not None:
            tx["maxFeePerGas"] = int(base) * 2 + int(priority)
            tx["maxPriorityFeePerGas"] = int(priority)
    except Exception:
        tx["gasPrice"] = w3.to_wei("5", "gwei")
    return tx


def _parse_reward(value: Optional[str]) -> int:
    if value is None:
        _raise("INSUFFICIENT_BALANCE")
    try:
        return _to_wei(value)
    except Exception:
        _raise("INSUFFICIENT_BALANCE")
    raise AssertionError("unreachable")


def _parse_deadline_days(value: Optional[int]) -> int:
    if value is None or value <= 0:
        _raise("DEADLINE_INVALID")
    return int(value)


def _calculate_deadline_timestamp(days: int) -> int:
    now = int(time.time())
    delta = int(days) * 24 * 60 * 60
    deadline = now + delta
    if deadline < 0 or deadline > _UINT64_MAX:
        _raise("DEADLINE_INVALID")
    return deadline


def _compute_spec_hash(metadata: Dict[str, Any]) -> bytes:
    serialized = json.dumps(metadata, sort_keys=True, separators=(",", ":"))
    return Web3.keccak(text=serialized)


def _build_error_payload(code: str) -> Dict[str, str]:
    return {"error": code, "message": ERROR_MESSAGES.get(code, ERROR_MESSAGES["UNKNOWN"])}


def _human_response(code: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status, content=_build_error_payload(code))


async def _pin_json(obj: Dict[str, Any]) -> str:
    if not PINNER_TOKEN or not PINNER_ENDPOINT:
        return "bafkreigh2akiscaildcdevcidxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

    headers: Dict[str, str] = {}
    payload: Any = obj

    if PINNER_KIND == "pinata":
        headers = {"Authorization": f"Bearer {PINNER_TOKEN}", "Content-Type": "application/json"}
        payload = {"pinataContent": obj}
    elif PINNER_KIND in {"web3storage", "nftstorage", "ipfs_http"}:
        headers = {"Authorization": f"Bearer {PINNER_TOKEN}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(PINNER_ENDPOINT, headers=headers, json=payload)

    if response.status_code // 100 != 2:
        print("[onebox] pinning failed", response.status_code, response.text)
        _raise("IPFS_FAILED", status=502)

    data = response.json() if response.content else {}
    cid = (
        data.get("IpfsHash")
        or data.get("cid")
        or data.get("Hash")
        or data.get("value")
        or next((v for v in data.values() if isinstance(v, str) and v.startswith("baf")), None)
    )

    if not cid:
        _raise("IPFS_FAILED", status=502)

    return str(cid)


async def _send_relayer_tx(tx: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    if not relayer:
        _raise("RELAYER_DISABLED", status=503)
    signed = relayer.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction).hex()
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
    return tx_hash, dict(receipt)


def _get_job_field(job: Any, key: str, index: Optional[int]) -> Any:
    if job is None:
        return None
    if isinstance(job, dict):
        if key in job:
            return job[key]
    try:
        if hasattr(job, key):
            return getattr(job, key)
    except Exception:
        pass
    if index is not None:
        try:
            if isinstance(job, (list, tuple)):
                if 0 <= index < len(job):
                    return job[index]
            else:
                return job[index]  # type: ignore[index]
        except Exception:
            return None
    return None


def _to_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, (bytes, bytearray)):
        if not value:
            return 0
        return int.from_bytes(value, "big")
    try:
        return int(value)
    except (TypeError, ValueError):
        pass
    try:
        return int(str(value), 0)
    except (TypeError, ValueError):
        return None


def _decode_packed_metadata(packed: Any) -> Dict[str, Any]:
    packed_int = _to_int(packed)
    if packed_int is None:
        return {}
    state = (packed_int >> 0) & 0x7
    deadline = (packed_int >> 77) & ((1 << 64) - 1)
    assigned_at = (packed_int >> 141) & ((1 << 64) - 1)
    success = (packed_int & (1 << 3)) != 0
    metadata: Dict[str, Any] = {"state": state}
    if deadline:
        metadata["deadline"] = int(deadline)
    if assigned_at:
        metadata["assignedAt"] = int(assigned_at)
    metadata["success"] = success
    return metadata


def _format_reward(value: Any) -> Optional[str]:
    wei = _to_int(value)
    if wei is None:
        return None
    amount = Decimal(wei) / Decimal(10**18)
    if amount == 0:
        return "0"
    normalized = amount.normalize()
    if normalized == normalized.to_integral():
        normalized = normalized.quantize(Decimal(1))
    return format(normalized, "f")


def _normalize_address(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        if not value:
            return None
        value = "0x" + value.hex()
    elif isinstance(value, int):
        if value == 0:
            return None
        value = f"0x{value:040x}"
    value_str = str(value).strip()
    if not value_str:
        return None
    lower = value_str.lower()
    if lower == _ZERO_ADDRESS:
        return None
    if value_str.startswith("0x") or value_str.startswith("0X"):
        try:
            return Web3.to_checksum_address(value_str)
        except Exception:
            return value_str
    return value_str


async def _read_status(job_id: int) -> StatusResponse:
    try:
        job_call = registry.functions.jobs(job_id)
    except Exception:
        return StatusResponse(jobId=job_id, state="unknown")

    try:
        job = job_call.call()
    except Exception:
        return StatusResponse(jobId=job_id, state="unknown")

    if not job:
        return StatusResponse(jobId=job_id, state="unknown")

    metadata: Dict[str, Any] = {}
    packed = None
    if isinstance(job, dict) and "packedMetadata" in job:
        packed = job.get("packedMetadata")
    elif hasattr(job, "packedMetadata"):
        try:
            packed = getattr(job, "packedMetadata")
        except Exception:
            packed = None
    elif isinstance(job, (list, tuple)) and len(job) >= 9:
        state_probe = job[5] if len(job) > 5 else None
        if not (isinstance(state_probe, int) and 0 <= state_probe <= 7):
            packed = job[8]

    if packed:
        metadata = _decode_packed_metadata(packed)
    else:
        state = _to_int(_get_job_field(job, "state", 5))
        deadline = _to_int(_get_job_field(job, "deadline", 8))
        assigned_at = _to_int(_get_job_field(job, "assignedAt", 9))
        success = _get_job_field(job, "success", 6)
        metadata = {}
        if state is not None:
            metadata["state"] = state
        if deadline:
            metadata["deadline"] = deadline
        if assigned_at:
            metadata["assignedAt"] = assigned_at
        if success is not None:
            metadata["success"] = bool(success)

    state_code = _to_int(metadata.get("state"))
    state = _STATE_TO_STATUS.get(state_code or 0, "unknown")

    reward = _format_reward(_get_job_field(job, "reward", 2))
    token = _get_job_field(job, "token", None) or _get_job_field(job, "rewardToken", None)
    if isinstance(token, (bytes, bytearray)):
        token = "0x" + token.hex()
    if isinstance(token, int):
        token = f"0x{token:040x}"
    if not token and reward is not None and AGIALPHA_TOKEN:
        token = AGIALPHA_TOKEN
    if isinstance(token, str) and token.lower() == _ZERO_ADDRESS:
        token = None

    deadline_value = _to_int(metadata.get("deadline"))
    if deadline_value == 0:
        deadline_value = None

    assignee = _normalize_address(_get_job_field(job, "agent", 1))

    return StatusResponse(
        jobId=job_id,
        state=state,
        reward=reward,
        token=token,
        deadline=deadline_value,
        assignee=assignee,
    )


def _summarize_intent(intent: JobIntent) -> str:
    payload = intent.payload
    prefix = {
        "post_job": "Detected job posting request. ",
        "check_status": "Detected job status request. ",
        "finalize_job": "Detected job finalization request. ",
        "stake": "Detected staking request. ",
        "validate": "Detected validation request. ",
        "dispute": "Detected dispute request. ",
    }.get(intent.action, "")
    if intent.action == "post_job":
        reward = payload.reward or "1.0"
        deadline = payload.deadlineDays if payload.deadlineDays is not None else 7
        title = payload.title or "New Job"
        return prefix + (
            f'I will post a job “{title}” with reward {reward} '
            f"AGIALPHA and a {deadline}-day deadline. Proceed?"
        )
    if intent.action == "check_status":
        job_text = f"job {payload.jobId}" if payload.jobId is not None else "the requested job"
        return prefix + f"I will check the status of {job_text}. Proceed?"
    if intent.action == "finalize_job":
        job_text = f"job {payload.jobId}" if payload.jobId is not None else "the requested job"
        return prefix + f"I will finalize {job_text}. Proceed?"
    if intent.action == "stake":
        job_text = f"job {payload.jobId}" if payload.jobId is not None else "the requested job"
        return prefix + f"I will stake on {job_text}. Proceed?"
    if intent.action == "validate":
        job_text = f"job {payload.jobId}" if payload.jobId is not None else "the requested job"
        return prefix + f"I will validate {job_text}. Proceed?"
    if intent.action == "dispute":
        job_text = f"job {payload.jobId}" if payload.jobId is not None else "the requested job"
        return prefix + f"I will dispute {job_text}. Proceed?"
    return prefix + "I will process your request. Proceed?"


@router.post("/plan", response_model=PlanResponse, dependencies=[Depends(require_api)])
async def plan(req: PlanRequest) -> PlanResponse:
    mode_label = "expert" if req.expert else "guest"
    outcome = "ok"
    started = time.perf_counter()
    try:
        intent = _naive_parse(req.text)
        summary = _summarize_intent(intent)
        return PlanResponse(
            summary=summary,
            intent=intent,
            requiresConfirmation=True,
            warnings=[],
        )
    except HTTPException:
        outcome = "error"
        raise
    except Exception:
        outcome = "error"
        raise
    finally:
        duration = max(time.perf_counter() - started, 0.0)
        _PLAN_COUNTER.labels(mode_label, outcome).inc()
        _PLAN_LATENCY.labels(mode_label).observe(duration)


@router.post("/execute", response_model=ExecuteResponse, dependencies=[Depends(require_api)])
async def execute(req: ExecuteRequest) -> ExecuteResponse:
    intent = req.intent
    payload = intent.payload
    mode_label = req.mode
    action_label = getattr(intent, "action", "unknown") or "unknown"
    outcome = "ok"
    started = time.perf_counter()
    try:
        if intent.action == "post_job":
            reward_wei = _parse_reward(payload.reward)
            deadline_days = _parse_deadline_days(payload.deadlineDays)

            metadata = {
                "title": payload.title or "New Job",
                "description": payload.description or "",
                "attachments": [attachment.dict() for attachment in payload.attachments],
                "rewardToken": payload.rewardToken,
                "reward": payload.reward,
                "deadlineDays": deadline_days,
            }

            deadline_timestamp = _calculate_deadline_timestamp(deadline_days)
            metadata["deadline"] = deadline_timestamp
            spec_hash = _compute_spec_hash(metadata)

            cid = await _pin_json(metadata)
            uri = f"ipfs://{cid}"

            agent_types = payload.agentTypes
            func_name = "createJobWithAgentTypes" if agent_types is not None else "createJob"
            wallet_args: List[Any]
            if agent_types is not None:
                wallet_args = [
                    reward_wei,
                    int(deadline_timestamp),
                    int(agent_types),
                    spec_hash,
                    uri,
                ]
            else:
                wallet_args = [
                    reward_wei,
                    int(deadline_timestamp),
                    spec_hash,
                    uri,
                ]

            if req.mode == "wallet":
                to, data = _encode_wallet_call(func_name, wallet_args)
                return ExecuteResponse(ok=True, to=to, data=data, value="0x0", chainId=CHAIN_ID)

            if not relayer:
                _raise("RELAYER_DISABLED", status=503)
            if agent_types is not None:
                func = registry.functions.createJobWithAgentTypes(
                    reward_wei,
                    int(deadline_timestamp),
                    int(agent_types),
                    spec_hash,
                    uri,
                )
            else:
                func = registry.functions.createJob(
                    reward_wei,
                    int(deadline_timestamp),
                    spec_hash,
                    uri,
                )
            tx = _build_tx(func, relayer.address)
            tx_hash, receipt = await _send_relayer_tx(tx)
            job_id = _decode_job_created(receipt)

            return ExecuteResponse(
                ok=True,
                jobId=job_id,
                txHash=tx_hash,
                receiptUrl=EXPLORER_TX_TPL.format(tx=tx_hash),
            )

        if intent.action == "finalize_job":
            if payload.jobId is None:
                _raise("JOB_ID_REQUIRED")
            job_id = int(payload.jobId)

            if req.mode == "wallet":
                to, data = _encode_wallet_call("finalize", [job_id])
                return ExecuteResponse(ok=True, to=to, data=data, value="0x0", chainId=CHAIN_ID)

            if not relayer:
                _raise("RELAYER_DISABLED", status=503)
            func = registry.functions.finalize(job_id)
            tx = _build_tx(func, relayer.address)
            tx_hash, receipt = await _send_relayer_tx(tx)
            _ = receipt
            return ExecuteResponse(
                ok=True,
                jobId=job_id,
                txHash=tx_hash,
                receiptUrl=EXPLORER_TX_TPL.format(tx=tx_hash),
            )

        if intent.action == "check_status":
            job_id = int(payload.jobId or 0)
            status = await _read_status(job_id)
            return ExecuteResponse(ok=True, jobId=status.jobId)

        _raise("UNKNOWN")
        raise AssertionError("unreachable")
    except HTTPException:
        outcome = "error"
        raise
    except Exception:
        outcome = "error"
        raise
    finally:
        duration = max(time.perf_counter() - started, 0.0)
        _EXECUTE_COUNTER.labels(mode_label, action_label, outcome).inc()
        _EXECUTE_LATENCY.labels(mode_label, action_label).observe(duration)


@router.get("/status", response_model=StatusResponse, dependencies=[Depends(require_api)])
async def status(jobId: int) -> StatusResponse:  # noqa: N803 (FastAPI query param name)
    outcome = "ok"
    started = time.perf_counter()
    try:
        return await _read_status(jobId)
    except HTTPException:
        outcome = "error"
        raise
    except Exception:
        outcome = "error"
        raise
    finally:
        duration = max(time.perf_counter() - started, 0.0)
        _STATUS_COUNTER.labels(outcome=outcome).inc()
        _STATUS_LATENCY.observe(duration)


@router.get("/healthz", include_in_schema=False)
async def healthcheck() -> Dict[str, Any]:
    return {
        "ok": True,
        "chainId": w3.eth.chain_id,
        "registry": JOB_REGISTRY,
        "relayerEnabled": bool(relayer),
    }


@router.get("/metrics", include_in_schema=False)
def metrics_endpoint() -> Response:
    payload = generate_latest(_METRIC_REGISTRY)
    return Response(content=payload, media_type=CONTENT_TYPE_LATEST)


async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    code = exc.detail if isinstance(exc.detail, str) else "UNKNOWN"
    return _human_response(code, exc.status_code)


router.add_exception_handler(HTTPException, http_exception_handler)
