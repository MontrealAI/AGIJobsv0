# routes/onebox.py
# FastAPI router for a Web3-only, walletless-by-default "one-box" UX.
# Exposes: POST /onebox/plan, POST /onebox/execute, GET /onebox/status,
#          GET /onebox/healthz, GET /onebox/metrics.
# Everything chain-related (keys, gas, ABIs, pinning) stays on the server.

import json
import os
import re
import time
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Literal, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
try:  # pragma: no cover - tests provide a shim
    from fastapi.responses import PlainTextResponse
except Exception:  # pragma: no cover - fallback for test harnesses
    class PlainTextResponse:  # type: ignore[no-redef]
        def __init__(self, content: str, media_type: str = "text/plain") -> None:
            self.body = content.encode("utf-8") if isinstance(content, str) else content
            self.media_type = media_type
            self.status_code = 200
from pydantic import BaseModel, Field
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from web3 import Web3
try:  # pragma: no cover - compatibility with test shims
    from web3._utils.events import get_event_data
except Exception:  # pragma: no cover - fallback for simplified stubs
    def get_event_data(_codec, _abi, _log):  # type: ignore[no-redef]
        return {"args": {}}

try:  # pragma: no cover
    from web3.exceptions import BadFunctionCallOutput
except Exception:  # pragma: no cover - fallback when web3 shim missing
    class BadFunctionCallOutput(Exception):
        """Placeholder exception when web3 isn't installed."""

try:  # pragma: no cover
    from web3.middleware import geth_poa_middleware
except Exception:  # pragma: no cover - fallback shim
    def geth_poa_middleware(*_args, **_kwargs):  # type: ignore[no-redef]
        return None

SECONDS_PER_DAY = 86400
_UINT64_MAX = (1 << 64) - 1

# ---------- Environment ----------
RPC_URL = os.getenv("RPC_URL", "")
if not RPC_URL:
    raise RuntimeError("RPC_URL is required")

CHAIN_ID = int(os.getenv("CHAIN_ID", "0"))
JOB_REGISTRY = Web3.to_checksum_address(
    os.getenv("JOB_REGISTRY", "0x0000000000000000000000000000000000000000")
)
AGIALPHA_TOKEN = Web3.to_checksum_address(
    os.getenv("AGIALPHA_TOKEN", "0x0000000000000000000000000000000000000000")
)
AGIALPHA_DECIMALS = int(os.getenv("AGIALPHA_DECIMALS", "18"))
RELAYER_PK = os.getenv("ONEBOX_RELAYER_PRIVATE_KEY") or os.getenv("RELAYER_PK", "")
API_TOKEN = os.getenv("ONEBOX_API_TOKEN") or os.getenv("API_TOKEN", "")
EXPLORER_TX_TPL = (
    os.getenv("ONEBOX_EXPLORER_TX_BASE")
    or os.getenv("EXPLORER_TX_TPL", "https://explorer.example/tx/{tx}")
)
PINNER_KIND = os.getenv("PINNER_KIND", "").lower()
PINNER_ENDPOINT = os.getenv("PINNER_ENDPOINT", "")
PINNER_TOKEN = os.getenv("PINNER_TOKEN", "")

_ABI: List[Dict[str, Any]]
_abi_override = os.getenv("JOB_REGISTRY_ABI_JSON")
if _abi_override:
    _ABI = json.loads(_abi_override)
else:
    try:
        with open(
            os.path.join(os.path.dirname(__file__), "job_registry.abi.json"),
            "r",
            encoding="utf-8",
        ) as fh:
            _ABI = json.load(fh)
    except FileNotFoundError:
        _ABI = [
            {
                "inputs": [
                    {"internalType": "uint256", "name": "reward", "type": "uint256"},
                    {"internalType": "uint64", "name": "deadline", "type": "uint64"},
                    {"internalType": "bytes32", "name": "specHash", "type": "bytes32"},
                    {"internalType": "string", "name": "uri", "type": "string"},
                ],
                "name": "createJob",
                "outputs": [
                    {
                        "internalType": "uint256",
                        "name": "jobId",
                        "type": "uint256",
                    }
                ],
                "stateMutability": "nonpayable",
                "type": "function",
            },
            {
                "inputs": [
                    {"internalType": "uint256", "name": "jobId", "type": "uint256"}
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
                    {"internalType": "uint256", "name": "", "type": "uint256"}
                ],
                "stateMutability": "view",
                "type": "function",
            },
        ]

# ---------- Web3 ----------
w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 45}))
try:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
except Exception:  # pragma: no cover - optional middleware
    pass

if CHAIN_ID and w3.eth.chain_id != CHAIN_ID:
    # Not fatal, but expose mismatch via health endpoint.
    pass

registry = w3.eth.contract(address=JOB_REGISTRY, abi=_ABI)
relayer = w3.eth.account.from_key(RELAYER_PK) if RELAYER_PK else None

# ---------- Metrics ----------
PLAN_REQUESTS = Counter(
    "onebox_plan_requests_total",
    "Total /onebox/plan requests",
    labelnames=["outcome"],
)
PLAN_LATENCY = Histogram(
    "onebox_plan_duration_seconds",
    "Latency for /onebox/plan requests",
)
EXECUTE_REQUESTS = Counter(
    "onebox_execute_requests_total",
    "Total /onebox/execute requests",
    labelnames=["outcome"],
)
EXECUTE_LATENCY = Histogram(
    "onebox_execute_duration_seconds",
    "Latency for /onebox/execute requests",
)
EXECUTE_ACTION_REQUESTS = Counter(
    "onebox_execute_action_total",
    "Total execute requests per action",
    labelnames=["action", "outcome"],
)
EXECUTE_ACTION_LATENCY = Histogram(
    "onebox_execute_action_duration_seconds",
    "Latency for execute requests per action",
    labelnames=["action"],
)
STATUS_REQUESTS = Counter(
    "onebox_status_requests_total",
    "Total /onebox/status requests",
    labelnames=["outcome"],
)
STATUS_LATENCY = Histogram(
    "onebox_status_duration_seconds",
    "Latency for /onebox/status requests",
)

# ---------- API Router ----------
router = APIRouter(prefix="/onebox", tags=["onebox"])


def require_api(auth: Optional[str] = Header(None, alias="Authorization")) -> None:
    if not API_TOKEN:
        return
    if not auth:
        raise HTTPException(401, detail="MISSING_BEARER_TOKEN")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, detail="INVALID_BEARER_TOKEN")
    token = auth.split(" ", 1)[1].strip()
    if token != API_TOKEN:
        raise HTTPException(401, detail="INVALID_BEARER_TOKEN")


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
    to: Optional[str] = None
    data: Optional[str] = None
    value: Optional[str] = None
    chainId: Optional[int] = None


class StatusResponse(BaseModel):
    jobId: int
    state: Literal[
        "open",
        "assigned",
        "submitted",
        "completed",
        "disputed",
        "finalized",
        "cancelled",
        "unknown",
    ] = "unknown"
    reward: Optional[str] = None
    token: Optional[str] = None
    deadline: Optional[int] = None
    assignee: Optional[str] = None


ERRORS = {
    "INSUFFICIENT_BALANCE": "You don’t have enough AGIALPHA to fund this job. Reduce the reward or top up.",
    "INSUFFICIENT_ALLOWANCE": "Your wallet needs permission to use AGIALPHA. I can prepare an approval transaction.",
    "IPFS_FAILED": "I couldn’t package your job details. Remove broken links and try again.",
    "DEADLINE_INVALID": "That deadline is in the past. Pick at least 24 hours from now.",
    "NETWORK_CONGESTED": "The network is busy; I’ll retry briefly.",
    "RELAYER_NOT_CONFIGURED": "The orchestrator relayer is not configured.",
    "JOB_ID_REQUIRED": "A job ID is required for this action.",
    "REQUEST_EMPTY": "Describe the action you’d like me to take.",
    "UNSUPPORTED_ACTION": "This action is not yet supported.",
    "UNKNOWN": "Something went wrong. I’ll log details and help you try again.",
}

_STATE_LABELS = {
    0: "unknown",
    1: "open",
    2: "assigned",
    3: "submitted",
    4: "completed",
    5: "disputed",
    6: "finalized",
    7: "cancelled",
}
_STATE_MASK = 0x7
_DEADLINE_OFFSET = 77
_DEADLINE_MASK = ((1 << 64) - 1) << _DEADLINE_OFFSET
_ASSIGNED_OFFSET = 141
_ASSIGNED_MASK = ((1 << 64) - 1) << _ASSIGNED_OFFSET

_SPECIAL_ACTIONS = {
    "check_status": {
        "keywords": ("status", "state", "progress"),
        "summary": "Detected job status request ({phrase}). I can check the status of job {job_id}. Proceed?",
    },
    "finalize_job": {
        "keywords": ("finalize", "complete", "finish"),
        "summary": "Detected job finalization request ({phrase}). I can finalize job {job_id}. Proceed?",
    },
    "stake": {
        "keywords": ("stake",),
        "summary": "Detected staking request ({phrase}). I can stake on job {job_id}. Proceed?",
    },
    "validate": {
        "keywords": ("validate", "verification"),
        "summary": "Detected validation request ({phrase}). I can validate job {job_id}. Proceed?",
    },
    "dispute": {
        "keywords": ("dispute", "challenge"),
        "summary": "Detected dispute request ({phrase}). I can dispute job {job_id}. Proceed?",
    },
}


def _record_plan_metrics(outcome: str, duration: float) -> None:
    PLAN_REQUESTS.labels(outcome=outcome).inc()
    PLAN_LATENCY.observe(duration)


def _record_execute_metrics(outcome: str, duration: float, action: Optional[str]) -> None:
    EXECUTE_REQUESTS.labels(outcome=outcome).inc()
    EXECUTE_LATENCY.observe(duration)
    if action:
        action_label = action.lower()
        EXECUTE_ACTION_REQUESTS.labels(action=action_label, outcome=outcome).inc()
        EXECUTE_ACTION_LATENCY.labels(action=action_label).observe(duration)


def _record_status_metrics(outcome: str, duration: float) -> None:
    STATUS_REQUESTS.labels(outcome=outcome).inc()
    STATUS_LATENCY.observe(duration)


def _format_decimal(value: Decimal) -> str:
    quantized = value.normalize()
    if quantized == quantized.to_integral():
        return format(quantized.quantize(Decimal(1)), "f")
    return format(quantized, "f")


def _to_wei(amount: str) -> int:
    try:
        dec = Decimal(amount)
    except InvalidOperation as exc:  # pragma: no cover - guardrail
        raise HTTPException(400, detail="INSUFFICIENT_BALANCE") from exc
    if dec <= 0:
        raise HTTPException(400, detail="INSUFFICIENT_BALANCE")
    scaled = int(dec * (10 ** AGIALPHA_DECIMALS))
    return scaled


def _format_reward(amount: Optional[int]) -> Optional[str]:
    if amount is None:
        return None
    dec = Decimal(amount) / Decimal(10**AGIALPHA_DECIMALS)
    return _format_decimal(dec)


def _extract_job_id(text: str) -> Optional[int]:
    match = re.search(r"job\s*#?\s*(\d+)", text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    fallback = re.search(r"(\d+)", text)
    if fallback:
        return int(fallback.group(1))
    return None


def _find_phrase(keywords: Tuple[str, ...], text: str, job_id: int) -> str:
    for keyword in keywords:
        pattern = re.compile(rf"{keyword}[^.?!]*", re.IGNORECASE)
        match = pattern.search(text)
        if match:
            return match.group(0).strip()
    return f"{keywords[0]} job {job_id}"


def _detect_special_intent(text: str) -> Optional[Tuple[str, int, str]]:
    job_id = _extract_job_id(text)
    if job_id is None:
        return None
    lowered = text.lower()
    for action, info in _SPECIAL_ACTIONS.items():
        if any(keyword in lowered for keyword in info["keywords"]):
            phrase = _find_phrase(info["keywords"], text, job_id)
            summary = info["summary"].format(phrase=phrase, job_id=job_id)
            return action, job_id, summary
    return None


def _parse_reward(text: str) -> Optional[str]:
    match = re.search(r"(\d+(?:\.\d+)?)\s*(?:agi(?:alpha)?|token|credit)s?", text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def _parse_deadline_days(text: str) -> Optional[int]:
    match = re.search(r"(\d+)\s*(?:day|d)\b", text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    match = re.search(r"(\d+)\s*(?:week|w)\b", text, re.IGNORECASE)
    if match:
        return int(match.group(1)) * 7
    return None


def _normalize_title(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) > 160:
        cleaned = cleaned[:160].rstrip()
    return cleaned or "New Job"


def _plan_impl(req: PlanRequest) -> PlanResponse:
    text = req.text.strip()
    if not text:
        raise HTTPException(400, detail="REQUEST_EMPTY")

    special = _detect_special_intent(text)
    if special:
        action, job_id, summary = special
        intent = JobIntent(action=action, payload=Payload(jobId=job_id))
        requires_confirmation = action != "check_status"
        return PlanResponse(
            summary=summary,
            intent=intent,
            requiresConfirmation=requires_confirmation,
        )

    reward = _parse_reward(text) or "1"
    deadline_days = _parse_deadline_days(text) or 7
    title = _normalize_title(text)
    intent = JobIntent(
        action="post_job",
        payload=Payload(title=title, reward=reward, deadlineDays=deadline_days),
    )
    summary = (
        f"I will post a job “{title}” with reward {reward} AGIALPHA and a "
        f"{deadline_days}-day deadline. Proceed?"
    )
    return PlanResponse(summary=summary, intent=intent, requiresConfirmation=True)


def _canonical_payload(intent: JobIntent, deadline_ts: int) -> Dict[str, Any]:
    payload = intent.payload
    return {
        "title": payload.title or "New Job",
        "description": payload.description or "",
        "attachments": [attachment.dict() for attachment in payload.attachments],
        "rewardToken": payload.rewardToken,
        "reward": payload.reward,
        "deadlineDays": payload.deadlineDays,
        "deadline": deadline_ts,
        "agentTypes": payload.agentTypes,
    }


def _calculate_deadline_timestamp(days: int) -> int:
    if days <= 0:
        raise HTTPException(400, detail="DEADLINE_INVALID")
    seconds = days * SECONDS_PER_DAY
    if seconds > _UINT64_MAX:
        raise HTTPException(400, detail="DEADLINE_INVALID")
    base = int(time.time())
    deadline = base + seconds
    if deadline > _UINT64_MAX:
        raise HTTPException(400, detail="DEADLINE_INVALID")
    return deadline


def _compute_spec_hash(metadata: Dict[str, Any]) -> bytes:
    canonical = json.dumps(metadata, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return Web3.keccak(canonical)


def _bytes_to_hex(value: bytes) -> str:
    try:
        return w3.to_hex(value)
    except Exception:
        return "0x" + value.hex()


def _ensure_explorer_link(tx_hash: str) -> str:
    try:
        return EXPLORER_TX_TPL.format(tx=tx_hash)
    except Exception:  # pragma: no cover - guardrail
        return tx_hash


def _raise_error(code: str, status: int = 400) -> None:
    raise HTTPException(status, detail=code)


async def _pin_json(obj: Dict[str, Any]) -> str:
    if not PINNER_TOKEN or not PINNER_ENDPOINT:
        # Dev fallback (still returns a stable-looking CID)
        return "bafkreigh2akiscaildcdevcidxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

    headers: Dict[str, str] = {"Content-Type": "application/json"}
    body: Any = obj

    if PINNER_KIND == "pinata":
        headers["Authorization"] = f"Bearer {PINNER_TOKEN}"
        body = {"pinataContent": obj}
    elif PINNER_KIND in {"web3storage", "nftstorage", "ipfs_http"}:
        headers["Authorization"] = f"Bearer {PINNER_TOKEN}"
    else:
        headers["Authorization"] = f"Bearer {PINNER_TOKEN}"

    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(PINNER_ENDPOINT, headers=headers, json=body)
    if response.status_code // 100 != 2:
        _raise_error("IPFS_FAILED", status=502)
    data = response.json() if response.content else {}
    cid = (
        data.get("IpfsHash")
        or data.get("cid")
        or data.get("Hash")
        or data.get("value")
    )
    if not cid:
        cid = next(
            (
                value
                for value in data.values()
                if isinstance(value, str) and value.startswith("baf")
            ),
            None,
        )
    if not cid:
        _raise_error("IPFS_FAILED", status=502)
    return cid


def _build_tx(function_call, sender: str) -> Dict[str, Any]:
    nonce = w3.eth.get_transaction_count(sender)
    try:
        gas = function_call.estimate_gas({"from": sender})
    except Exception:
        gas = 300_000
    tx: Dict[str, Any] = function_call.build_transaction(
        {"from": sender, "nonce": nonce, "chainId": CHAIN_ID or w3.eth.chain_id, "gas": gas}
    )
    try:
        pending = w3.eth.get_block("pending")
        base_fee = pending.get("baseFeePerGas")
        priority = w3.eth.max_priority_fee
        if base_fee is not None and priority is not None:
            tx["maxFeePerGas"] = int(base_fee * 2) + int(priority)
            tx["maxPriorityFeePerGas"] = int(priority)
    except Exception:
        tx["gasPrice"] = w3.to_wei("5", "gwei")
    return tx


def _decode_job_created(receipt: Dict[str, Any]) -> Optional[int]:
    try:
        event = registry.events.JobCreated()
        entries = event.process_receipt(receipt)
        for entry in entries or []:
            args = getattr(entry, "args", None) or entry.get("args") if isinstance(entry, dict) else {}
            job_id = args.get("jobId") if isinstance(args, dict) else None
            if job_id is not None:
                return int(job_id)
    except Exception:
        pass

    try:
        event_abi = next(
            (entry for entry in _ABI if entry.get("type") == "event" and entry.get("name") == "JobCreated"),
            None,
        )
        if event_abi:
            for raw in receipt.get("logs", []):
                try:
                    parsed = get_event_data(w3.codec, event_abi, raw)
                    job_id = parsed.get("args", {}).get("jobId")
                    if job_id is not None:
                        return int(job_id)
                except Exception:
                    continue
    except Exception:
        pass

    try:
        return int(registry.functions.lastJobId().call())
    except Exception:
        return None


def _decode_metadata(packed: int) -> Tuple[str, Optional[int], Optional[int]]:
    state = _STATE_LABELS.get(packed & _STATE_MASK, "unknown")
    deadline_bits = (packed & _DEADLINE_MASK) >> _DEADLINE_OFFSET
    deadline = int(deadline_bits) if deadline_bits else None
    assigned_bits = (packed & _ASSIGNED_MASK) >> _ASSIGNED_OFFSET
    assigned_at = int(assigned_bits) if assigned_bits else None
    return state, deadline, assigned_at


def _checksum_or_none(value: Any) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, str) and int(value, 16) == 0:
        return None
    if isinstance(value, (bytes, bytearray)) and int.from_bytes(value, "big") == 0:
        return None
    try:
        return Web3.to_checksum_address(value)
    except Exception:
        return None


async def _read_status(job_id: int) -> StatusResponse:
    try:
        job = registry.functions.jobs(job_id).call()
    except (BadFunctionCallOutput, Exception):
        return StatusResponse(jobId=job_id)

    agent: Optional[str] = None
    reward_raw: Optional[int] = None
    state = "unknown"
    deadline: Optional[int] = None

    if isinstance(job, dict):
        agent = job.get("agent")
        reward_raw = job.get("reward")
        packed = job.get("packedMetadata")
        if isinstance(packed, int):
            state, deadline, _assigned_at = _decode_metadata(packed)
    elif isinstance(job, (list, tuple)):
        if len(job) > 1:
            agent = job[1]
        if len(job) > 2:
            reward_raw = job[2]
        if len(job) > 5 and isinstance(job[5], int):
            state = _STATE_LABELS.get(job[5], "unknown")
        if len(job) > 8 and isinstance(job[8], int):
            deadline = job[8] or None
    else:  # pragma: no cover - unexpected shapes
        return StatusResponse(jobId=job_id)

    reward = _format_reward(int(reward_raw)) if reward_raw is not None else None
    checksum_agent = _checksum_or_none(agent)

    return StatusResponse(
        jobId=job_id,
        state=state,
        reward=reward,
        token=AGIALPHA_TOKEN if reward is not None else None,
        deadline=deadline,
        assignee=checksum_agent,
    )


@router.post("/plan", response_model=PlanResponse, dependencies=[Depends(require_api)])
async def plan(req: PlanRequest) -> PlanResponse:
    start = time.monotonic()
    try:
        response = _plan_impl(req)
    except HTTPException:
        _record_plan_metrics("failure", time.monotonic() - start)
        raise
    except Exception as exc:  # pragma: no cover - defensive
        _record_plan_metrics("failure", time.monotonic() - start)
        raise HTTPException(500, detail="UNKNOWN") from exc
    _record_plan_metrics("success", time.monotonic() - start)
    return response


@router.post("/execute", response_model=ExecuteResponse, dependencies=[Depends(require_api)])
async def execute(req: ExecuteRequest) -> ExecuteResponse:
    start = time.monotonic()
    action = req.intent.action
    try:
        payload = req.intent.payload
        if action == "post_job":
            if not payload.reward:
                _raise_error("INSUFFICIENT_BALANCE")
            if payload.deadlineDays is None:
                _raise_error("DEADLINE_INVALID")
            deadline_ts = _calculate_deadline_timestamp(int(payload.deadlineDays))
            job_json = _canonical_payload(req.intent, deadline_ts)
            spec_hash = _compute_spec_hash(job_json)
            cid = await _pin_json(job_json)
            uri = f"ipfs://{cid}"
            reward_wei = _to_wei(payload.reward)
            agent_types = payload.agentTypes or req.intent.constraints.get("agentTypes")

            if req.mode == "wallet":
                fn_name = "createJobWithAgentTypes" if agent_types is not None else "createJob"
                args: List[Any]
                if agent_types is not None:
                    args = [reward_wei, deadline_ts, int(agent_types), _bytes_to_hex(spec_hash), uri]
                else:
                    args = [reward_wei, deadline_ts, _bytes_to_hex(spec_hash), uri]
                to, data = registry.address, registry.encodeABI(fn_name=fn_name, args=args)
                return ExecuteResponse(
                    ok=True,
                    to=to,
                    data=data,
                    value="0x0",
                    chainId=CHAIN_ID or w3.eth.chain_id,
                )

            if not relayer:
                _raise_error("RELAYER_NOT_CONFIGURED", status=503)
            if agent_types is not None:
                func = registry.functions.createJobWithAgentTypes(
                    reward_wei, deadline_ts, int(agent_types), _bytes_to_hex(spec_hash), uri
                )
            else:
                func = registry.functions.createJob(
                    reward_wei, deadline_ts, _bytes_to_hex(spec_hash), uri
                )
            tx = _build_tx(func, relayer.address)
            tx_hash, receipt = await _send_relayer_tx(tx)
            job_id = _decode_job_created(receipt)
            return ExecuteResponse(
                ok=True,
                jobId=job_id,
                txHash=tx_hash,
                receiptUrl=_ensure_explorer_link(tx_hash),
            )

        if action == "finalize_job":
            if payload.jobId is None:
                _raise_error("JOB_ID_REQUIRED")
            if req.mode == "wallet":
                to, data = registry.address, registry.encodeABI(
                    fn_name="finalize", args=[int(payload.jobId)]
                )
                return ExecuteResponse(
                    ok=True,
                    jobId=int(payload.jobId),
                    to=to,
                    data=data,
                    value="0x0",
                    chainId=CHAIN_ID or w3.eth.chain_id,
                )
            if not relayer:
                _raise_error("RELAYER_NOT_CONFIGURED", status=503)
            func = registry.functions.finalize(int(payload.jobId))
            tx = _build_tx(func, relayer.address)
            tx_hash, _receipt = await _send_relayer_tx(tx)
            return ExecuteResponse(
                ok=True,
                jobId=int(payload.jobId),
                txHash=tx_hash,
                receiptUrl=_ensure_explorer_link(tx_hash),
            )

        if action == "check_status":
            status = await _read_status(int(payload.jobId or 0))
            return ExecuteResponse(ok=True, jobId=status.jobId)

        _raise_error("UNSUPPORTED_ACTION")
    except HTTPException as exc:
        _record_execute_metrics("failure", time.monotonic() - start, action)
        raise exc
    except Exception as exc:  # pragma: no cover - defensive
        _record_execute_metrics("failure", time.monotonic() - start, action)
        raise HTTPException(500, detail="UNKNOWN") from exc
    finally:
        if "exc" not in locals():
            _record_execute_metrics("success", time.monotonic() - start, action)


async def _send_relayer_tx(tx: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    if not relayer:
        _raise_error("RELAYER_NOT_CONFIGURED", status=503)
    signed = relayer.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction).hex()
    receipt = dict(w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180))
    return tx_hash, receipt


@router.get("/status", response_model=StatusResponse, dependencies=[Depends(require_api)])
async def status(jobId: int) -> StatusResponse:  # noqa: N803 - API parameter casing
    start = time.monotonic()
    try:
        response = await _read_status(jobId)
    except HTTPException:
        _record_status_metrics("failure", time.monotonic() - start)
        raise
    except Exception as exc:  # pragma: no cover - defensive
        _record_status_metrics("failure", time.monotonic() - start)
        raise HTTPException(500, detail="UNKNOWN") from exc
    _record_status_metrics("success", time.monotonic() - start)
    return response


@router.get("/healthz", dependencies=[Depends(require_api)])
async def healthcheck() -> Dict[str, Any]:
    return {
        "ok": True,
        "chainId": w3.eth.chain_id,
        "registry": registry.address,
        "relayerEnabled": bool(relayer),
        "rpc": RPC_URL,
    }


@router.get("/metrics")
def metrics_endpoint() -> PlainTextResponse:
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


__all__ = [
    "router",
    "plan",
    "execute",
    "status",
    "healthcheck",
    "metrics_endpoint",
    "JobIntent",
    "Payload",
    "PlanRequest",
    "ExecuteRequest",
    "StatusResponse",
    "Web3",
    "_calculate_deadline_timestamp",
    "_compute_spec_hash",
    "_decode_job_created",
    "_read_status",
    "_UINT64_MAX",
]
