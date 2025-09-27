# routes/onebox.py
# FastAPI router for a Web3-only, walletless-by-default "one-box" UX.
# Exposes: POST /onebox/plan, POST /onebox/execute, GET /onebox/status,
# plus /onebox/healthz and /onebox/metrics (Prometheus).
# Everything chain-related (keys, gas, ABIs, pinning) stays on the server.

import json
import logging
import os
import re
import time
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional, Tuple

import httpx
import prometheus_client
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from web3 import Web3
from web3._utils.events import get_event_data
from web3.middleware import geth_poa_middleware

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
_RELAYER_PK = os.getenv("ONEBOX_RELAYER_PRIVATE_KEY") or os.getenv("RELAYER_PK", "")
_API_TOKEN = os.getenv("ONEBOX_API_TOKEN") or os.getenv("API_TOKEN", "")
EXPLORER_TX_TPL = os.getenv(
    "ONEBOX_EXPLORER_TX_BASE", os.getenv("EXPLORER_TX_TPL", "https://explorer.example/tx/{tx}")
)
PINNER_KIND = os.getenv("PINNER_KIND", "").lower()
PINNER_ENDPOINT = os.getenv("PINNER_ENDPOINT", "")
PINNER_TOKEN = os.getenv("PINNER_TOKEN", "")
CORS_ALLOW_ORIGINS = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")]

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

# ---------- Metrics ----------
_METRICS_REGISTRY = prometheus_client.CollectorRegistry()
_PLAN_TOTAL = prometheus_client.Counter(
    "plan_total",
    "Total /onebox/plan requests",
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


def require_api(auth: Optional[str] = Header(None, alias="Authorization")):
    if not _API_TOKEN:
        return
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(401, "AUTH_MISSING")
    token = auth.split(" ", 1)[1].strip()
    if token != _API_TOKEN:
        raise HTTPException(401, "AUTH_INVALID")


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
    rewardToken: str = "AGIALPHA"
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


class ExecuteRequest(BaseModel):
    intent: JobIntent
    mode: Literal["relayer", "wallet"] = "relayer"


class ExecuteResponse(BaseModel):
    ok: bool = True
    jobId: Optional[int] = None
    txHash: Optional[str] = None
    receiptUrl: Optional[str] = None
    specCid: Optional[str] = None
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
    "INSUFFICIENT_BALANCE": "You don’t have enough AGIALPHA to fund this job. Reduce the reward or top up.",
    "INSUFFICIENT_ALLOWANCE": "Your wallet needs permission to use AGIALPHA. I can prepare an approval transaction.",
    "IPFS_FAILED": "I couldn’t package your job details. Remove broken links and try again.",
    "DEADLINE_INVALID": "That deadline is in the past. Pick at least 24 hours from now.",
    "NETWORK_CONGESTED": "The network is busy; I’ll retry briefly.",
    "UNKNOWN": "Something went wrong. I’ll log details and help you try again.",
}


# ---------- Helpers ----------
def _to_wei(amount: str) -> int:
    return int(Decimal(amount) * Decimal(10**AGIALPHA_DECIMALS))


def _format_reward(value: int) -> str:
    precision = Decimal(10**AGIALPHA_DECIMALS)
    return str(Decimal(value) / precision)


def _normalize_title(text: str) -> str:
    s = re.sub(r"\s+", " ", text).strip()
    return s[:160] if s else "New Job"


def _extract_job_id(text: str) -> Optional[int]:
    match = re.search(r"job\s*#?\s*(\d+)", text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    digits = re.search(r"\b(\d{1,8})\b", text)
    return int(digits.group(1)) if digits else None


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
        raise HTTPException(400, "DEADLINE_INVALID")
    seconds = days * 86400
    if seconds > _UINT64_MAX:
        raise HTTPException(400, "DEADLINE_INVALID")
    now = int(time.time())
    deadline = now + seconds
    if deadline > _UINT64_MAX:
        raise HTTPException(400, "DEADLINE_INVALID")
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

    reward = _parse_reward(text) or "1.0"
    deadline_days = _parse_deadline_days(text) or 7
    title = _normalize_title(text)
    payload = Payload(title=title, reward=reward, deadlineDays=deadline_days)
    return JobIntent(action="post_job", payload=payload)


def _summary_for_intent(intent: JobIntent, request_text: str) -> Tuple[str, bool, List[str]]:
    warnings: List[str] = []
    request_snippet = request_text.strip()
    if intent.action == "finalize_job":
        jid = intent.payload.jobId
        summary = f"Detected job finalization request for job {jid}. Confirm to finalize job {jid}."
        return summary, True, warnings
    if intent.action == "check_status":
        jid = intent.payload.jobId
        summary = f"Detected job status request for job {jid}. ({request_snippet})"
        return summary, False, warnings
    if intent.action == "stake":
        jid = intent.payload.jobId
        summary = f"Detected staking request for job {jid}. ({request_snippet}) Confirm to continue."
        return summary, True, warnings
    if intent.action == "validate":
        jid = intent.payload.jobId
        summary = (
            f"Detected validation request for job {jid}. ({request_snippet}) "
            f"Confirm to assign validators."
        )
        return summary, True, warnings
    if intent.action == "dispute":
        jid = intent.payload.jobId
        summary = (
            f"Detected dispute request for job {jid}. ({request_snippet}) "
            f"Confirm to escalate job {jid}."
        )
        return summary, True, warnings

    payload = intent.payload
    reward = payload.reward or _parse_reward(request_text) or "1.0"
    days = payload.deadlineDays if payload.deadlineDays is not None else (_parse_deadline_days(request_text) or 7)
    title = payload.title or _normalize_title(request_text)
    summary = (
        f'I will post a job "{title}" with reward {reward} AGIALPHA '
        f"and a {days}-day deadline. Proceed?"
    )
    if len(summary) > 140:
        summary = summary[:137] + "…"
    return summary, True, warnings


async def _pin_json(obj: dict) -> str:
    if not PINNER_TOKEN or not PINNER_ENDPOINT:
        logger.warning("pinning disabled; returning static CID")
        return "bafkreigh2akiscaildcdevcidxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    body: Any = obj
    if PINNER_KIND == "pinata":
        headers["Authorization"] = f"Bearer {PINNER_TOKEN}"
        body = {"pinataContent": obj}
    elif PINNER_KIND in {"web3storage", "nftstorage", "ipfs_http"}:
        headers["Authorization"] = f"Bearer {PINNER_TOKEN}"
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(PINNER_ENDPOINT, headers=headers, json=body)
    except httpx.RequestError as exc:  # pragma: no cover - network failures are runtime only
        logger.error("pinning request failed: %s", exc)
        raise HTTPException(502, "IPFS_FAILED") from exc
    if response.status_code // 100 != 2:
        logger.error("pinning service error: status=%s body=%s", response.status_code, response.text)
        raise HTTPException(502, "IPFS_FAILED")
    try:
        payload = response.json() if response.content else {}
    except ValueError as exc:
        raise HTTPException(502, "IPFS_FAILED") from exc
    cid = (
        payload.get("IpfsHash")
        or payload.get("cid")
        or payload.get("Hash")
        or payload.get("value")
        or next(
            (v for v in payload.values() if isinstance(v, str) and v.startswith("baf")),
            None,
        )
    )
    if not cid:
        raise HTTPException(502, "IPFS_FAILED")
    return cid


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
        raise HTTPException(400, "RELAY_UNAVAILABLE")
    signed = relayer.sign_transaction(tx)
    txh = w3.eth.send_raw_transaction(signed.rawTransaction).hex()
    receipt = w3.eth.wait_for_transaction_receipt(txh, timeout=180)
    return txh, dict(receipt)


# ---------- Routes ----------
@router.post("/plan", response_model=PlanResponse, dependencies=[Depends(require_api)])
async def plan(request: Request, req: PlanRequest):
    start = time.perf_counter()
    correlation_id = _get_correlation_id(request)
    intent_type = "unknown"
    status_code = 200

    try:
        intent = _naive_parse(req.text)
        intent_type = intent.action
        summary, requires_confirmation, warnings = _summary_for_intent(intent, req.text)
        response = PlanResponse(
            summary=summary,
            intent=intent,
            requiresConfirmation=requires_confirmation,
            warnings=warnings,
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




@router.post("/execute", response_model=ExecuteResponse, dependencies=[Depends(require_api)])
async def execute(request: Request, req: ExecuteRequest):
    start = time.perf_counter()
    correlation_id = _get_correlation_id(request)
    intent = req.intent
    payload = intent.payload
    intent_type = intent.action if intent and intent.action else "unknown"
    status_code = 200

    try:
        if intent.action == "post_job":
            if not payload.reward:
                raise HTTPException(400, "INSUFFICIENT_BALANCE")
            if payload.deadlineDays is None:
                raise HTTPException(400, "DEADLINE_INVALID")

            deadline_ts = _calculate_deadline_timestamp(int(payload.deadlineDays))
            job_payload = {
                "title": payload.title or "New Job",
                "description": payload.description or "",
                "attachments": [a.dict() for a in payload.attachments],
                "rewardToken": payload.rewardToken or "AGIALPHA",
                "reward": str(payload.reward),
                "deadlineDays": int(payload.deadlineDays),
                "deadline": deadline_ts,
                "agentTypes": payload.agentTypes,
            }
            spec_hash = _compute_spec_hash(job_payload)
            job_payload["specHash"] = "0x" + spec_hash.hex()
            cid = await _pin_json(job_payload)
            uri = f"ipfs://{cid}"
            reward_wei = _to_wei(str(payload.reward))

            if req.mode == "wallet":
                to, data = _encode_wallet_call(
                    "postJob",
                    [uri, AGIALPHA_TOKEN, reward_wei, int(payload.deadlineDays)],
                )
                response = ExecuteResponse(
                    ok=True,
                    to=to,
                    data=data,
                    value="0x0",
                    chainId=CHAIN_ID,
                    specCid=cid,
                    specHash="0x" + spec_hash.hex(),
                    deadline=deadline_ts,
                    reward=str(payload.reward),
                    token=payload.rewardToken,
                    status="prepared",
                )
            else:
                func = registry.functions.postJob(
                    uri, AGIALPHA_TOKEN, reward_wei, int(payload.deadlineDays)
                )
                sender = relayer.address if relayer else intent.userContext.get("sender")
                if not sender:
                    raise HTTPException(400, "RELAY_UNAVAILABLE")
                tx = _build_tx(func, sender)
                txh, receipt = await _send_relayer_tx(tx)
                job_id = _decode_job_created(receipt)
                response = ExecuteResponse(
                    ok=True,
                    jobId=job_id,
                    txHash=txh,
                    receiptUrl=EXPLORER_TX_TPL.format(tx=txh),
                    specCid=cid,
                    specHash="0x" + spec_hash.hex(),
                    deadline=deadline_ts,
                    reward=str(payload.reward),
                    token=payload.rewardToken,
                    status="submitted",
                )

        elif intent.action == "finalize_job":
            if payload.jobId is None:
                raise HTTPException(400, "JOB_ID_REQUIRED")
            if req.mode == "wallet":
                to, data = _encode_wallet_call("finalize", [int(payload.jobId)])
                response = ExecuteResponse(
                    ok=True,
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
                    raise HTTPException(400, "RELAY_UNAVAILABLE")
                tx = _build_tx(func, relayer.address)
                txh, _receipt = await _send_relayer_tx(tx)
                response = ExecuteResponse(
                    ok=True,
                    jobId=int(payload.jobId),
                    txHash=txh,
                    receiptUrl=EXPLORER_TX_TPL.format(tx=txh),
                    status="finalized",
                )

        elif intent.action == "check_status":
            if payload.jobId is None:
                raise HTTPException(400, "JOB_ID_REQUIRED")
            status = await _read_status(int(payload.jobId))
            response = ExecuteResponse(
                ok=True,
                jobId=status.jobId,
                status=status.state,
                reward=status.reward,
                token=status.token,
            )

        else:
            raise HTTPException(400, "UNSUPPORTED_ACTION")

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


@router.get("/healthz", dependencies=[Depends(require_api)])
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
    "StatusResponse",
    "_calculate_deadline_timestamp",
    "_compute_spec_hash",
    "_decode_job_created",
    "_naive_parse",
    "execute",
    "healthcheck",
    "metrics_endpoint",
    "plan",
    "status",
    "_UINT64_MAX",
    "_read_status",
]
