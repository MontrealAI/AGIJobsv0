# routes/onebox.py
# FastAPI router for a Web3-only, walletless-by-default "one-box" UX.
# Exposes: POST /onebox/plan, POST /onebox/execute, GET /onebox/status
# Everything chain-related (keys, gas, ABIs, pinning) stays on the server.

import os, json, re
from decimal import Decimal
from typing import Optional, Literal, List, Tuple, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from web3 import Web3
from web3.middleware import geth_poa_middleware
from web3._utils.events import get_event_data
import httpx

# ---------- Settings ----------
RPC_URL = os.getenv("RPC_URL", "")
CHAIN_ID = int(os.getenv("CHAIN_ID", "0"))
JOB_REGISTRY = Web3.to_checksum_address(os.getenv("JOB_REGISTRY", "0x0000000000000000000000000000000000000000"))
AGIALPHA_TOKEN = Web3.to_checksum_address(os.getenv("AGIALPHA_TOKEN", "0x0000000000000000000000000000000000000000"))
RELAYER_PK = os.getenv("RELAYER_PK", "")
API_TOKEN = os.getenv("API_TOKEN", "")
EXPLORER_TX_TPL = os.getenv("EXPLORER_TX_TPL", "https://explorer.example/tx/{tx}")
PINNER_KIND = os.getenv("PINNER_KIND", "").lower()  # pinata|web3storage|nftstorage|ipfs_http
PINNER_ENDPOINT = os.getenv("PINNER_ENDPOINT", "")
PINNER_TOKEN = os.getenv("PINNER_TOKEN", "")
CORS_ALLOW_ORIGINS = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")]

# Minimal ABI (override via JOB_REGISTRY_ABI_JSON for your deployed interface)
_MIN_ABI = [
  {"inputs":[{"internalType":"string","name":"uri","type":"string"},
             {"internalType":"address","name":"rewardToken","type":"address"},
             {"internalType":"uint256","name":"reward","type":"uint256"},
             {"internalType":"uint256","name":"deadlineDays","type":"uint256"}],
   "name":"postJob","outputs":[{"internalType":"uint256","name":"jobId","type":"uint256"}],
   "stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"jobId","type":"uint256"}],
   "name":"finalize","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"anonymous":False,"inputs":[{"indexed":True,"internalType":"uint256","name":"jobId","type":"uint256"},
                               {"indexed":True,"internalType":"address","name":"employer","type":"address"}],
   "name":"JobCreated","type":"event"},
  {"inputs":[],"name":"lastJobId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],
   "stateMutability":"view","type":"function"}
]
_ABI = json.loads(os.getenv("JOB_REGISTRY_ABI_JSON", json.dumps(_MIN_ABI)))

# ---------- Web3 ----------
if not RPC_URL:
    raise RuntimeError("RPC_URL is required")
w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 45}))
# PoA chains (Sepolia/others) sometimes need POA middleware:
try:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
except Exception:
    pass
if CHAIN_ID and w3.eth.chain_id != CHAIN_ID:
    # Not fatal, but helpful to catch misconfig
    pass
registry = w3.eth.contract(address=JOB_REGISTRY, abi=_ABI)
relayer = w3.eth.account.from_key(RELAYER_PK) if RELAYER_PK else None

# ---------- API Router ----------
router = APIRouter(prefix="/onebox", tags=["onebox"])

def require_api(auth: Optional[str] = Header(None, alias="Authorization")):
    if not API_TOKEN:
        return
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    if token != API_TOKEN:
        raise HTTPException(401, "invalid bearer token")

# ---------- Models ----------
Action = Literal["post_job","finalize_job","check_status","stake","dispute","validate"]

class Attachment(BaseModel):
    name: str
    ipfs: Optional[str] = None

class Payload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    attachments: List[Attachment] = []
    rewardToken: str = "AGIALPHA"
    reward: Optional[str] = None          # human amount, e.g. "5.0"
    deadlineDays: Optional[int] = None
    jobId: Optional[int] = None

class JobIntent(BaseModel):
    action: Action
    payload: Payload
    constraints: Dict[str, Any] = {}
    userContext: Dict[str, Any] = {}

class PlanRequest(BaseModel):
    text: str
    expert: bool = False

class PlanResponse(BaseModel):
    summary: str
    intent: JobIntent
    requiresConfirmation: bool = True
    warnings: List[str] = []

class ExecuteRequest(BaseModel):
    intent: JobIntent
    mode: Literal["relayer","wallet"] = "relayer"

class ExecuteResponse(BaseModel):
    ok: bool = True
    jobId: Optional[int] = None
    txHash: Optional[str] = None
    receiptUrl: Optional[str] = None
    # wallet mode (return tx data to sign)
    to: Optional[str] = None
    data: Optional[str] = None
    value: Optional[str] = None
    chainId: Optional[int] = None

class StatusResponse(BaseModel):
    jobId: int
    state: Literal["open","assigned","completed","finalized","unknown"] = "unknown"
    reward: Optional[str] = None
    token: Optional[str] = None
    deadline: Optional[int] = None
    assignee: Optional[str] = None

# ---------- Error dictionary (humanized) ----------
ERRORS = {
    "INSUFFICIENT_BALANCE": "You don’t have enough AGIALPHA to fund this job. Reduce the reward or top up.",
    "INSUFFICIENT_ALLOWANCE": "Your wallet needs permission to use AGIALPHA. I can prepare an approval transaction.",
    "IPFS_FAILED": "I couldn’t package your job details. Remove broken links and try again.",
    "DEADLINE_INVALID": "That deadline is in the past. Pick at least 24 hours from now.",
    "NETWORK_CONGESTED": "The network is busy; I’ll retry briefly.",
    "UNKNOWN": "Something went wrong. I’ll log details and help you try again."
}

# ---------- Helpers ----------
def _to_wei(amount: str) -> int:
    return int(Decimal(amount) * (10 ** 18))

def _normalize_title(text: str) -> str:
    s = re.sub(r"\s+", " ", text).strip()
    return s[:160] if s else "New Job"

def _naive_parse(text: str) -> JobIntent:
    t = text.strip()
    amt = re.search(r"(\d+(?:\.\d+)?)\s*agi(?:alpha)?", t, re.I)
    days = re.search(r"(\d+)\s*(?:d|day|days)", t, re.I)
    reward = amt.group(1) if amt else "1.0"
    deadline = int(days.group(1)) if days else 7
    title = _normalize_title(t)
    return JobIntent(action="post_job", payload=Payload(title=title, reward=reward, deadlineDays=deadline))

async def _pin_json(obj: dict) -> str:
    if not PINNER_TOKEN or not PINNER_ENDPOINT:
        # Dev fallback (still returns a stable-looking CID)
        return "bafkreigh2akiscaildcdevcidxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    headers = {}
    body = obj
    if PINNER_KIND == "pinata":
        headers = {"Authorization": f"Bearer {PINNER_TOKEN}", "Content-Type": "application/json"}
        body = {"pinataContent": obj}
    elif PINNER_KIND in ("web3storage","nftstorage"):
        headers = {"Authorization": f"Bearer {PINNER_TOKEN}", "Content-Type": "application/json"}
    elif PINNER_KIND == "ipfs_http":
        headers = {"Authorization": f"Bearer {PINNER_TOKEN}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=45) as x:
        r = await x.post(PINNER_ENDPOINT, headers=headers, json=body)
    if r.status_code // 100 != 2:
        raise HTTPException(502, f"{ERRORS['IPFS_FAILED']} (pinner {r.status_code})")
    j = r.json() if r.content else {}
    cid = j.get("IpfsHash") or j.get("cid") or j.get("Hash") or j.get("value") or None
    if not cid:
        # Some pin APIs return nested structures; attempt to find a cid-ish value
        cid = next((v for v in j.values() if isinstance(v, str) and v.startswith("baf")), None)
    if not cid:
        raise HTTPException(502, ERRORS["IPFS_FAILED"])
    return cid

def _build_tx(func, sender: str) -> dict:
    # EIP-1559 defaults with estimation; fallback to legacy gasPrice if needed
    nonce = w3.eth.get_transaction_count(sender)
    try:
        gas = func.estimate_gas({"from": sender})
    except Exception:
        gas = 300000
    tx = func.build_transaction({"from": sender, "nonce": nonce, "chainId": CHAIN_ID, "gas": gas})
    # Try EIP-1559 fields
    try:
        base = w3.eth.get_block("pending").baseFeePerGas
        prio = w3.eth.max_priority_fee
        tx["maxFeePerGas"] = int(base * 2) + prio
        tx["maxPriorityFeePerGas"] = prio
    except Exception:
        tx["gasPrice"] = w3.to_wei("5", "gwei")
    return tx

def _encode_wallet_call(func_name: str, args: list) -> Tuple[str, str]:
    data = registry.encodeABI(fn_name=func_name, args=args)
    return registry.address, data

def _decode_job_created(receipt) -> Optional[int]:
    # Try to parse JobCreated(jobId, employer)
    try:
        evt_abi = next((a for a in _ABI if a.get("type")=="event" and a.get("name")=="JobCreated"), None)
        if not evt_abi:
            return None
        for lg in receipt["logs"]:
            try:
                ev = get_event_data(w3.codec, evt_abi, lg)
                if ev and ev["event"] == "JobCreated":
                    return int(ev["args"]["jobId"])
            except Exception:
                continue
    except Exception:
        pass
    # Fallback: try a view if available
    try:
        return int(registry.functions.lastJobId().call())
    except Exception:
        return None

async def _send_relayer_tx(tx: dict) -> Tuple[str, dict]:
    if not relayer:
        raise HTTPException(400, "Relayer not configured")
    signed = relayer.sign_transaction(tx)
    txh = w3.eth.send_raw_transaction(signed.rawTransaction).hex()
    receipt = w3.eth.wait_for_transaction_receipt(txh, timeout=180)
    return txh, dict(receipt)

async def _read_status(job_id: int) -> StatusResponse:
    # NOTE: tailor to your contract (add views or parse events for richer state).
    # Here we only return 'open' unless your ABI exposes more.
    try:
        # Example if you have a view: (customize as needed)
        # st = registry.functions.getJobState(job_id).call()
        # mapping = {0:"open",1:"assigned",2:"completed",3:"finalized"}
        # return StatusResponse(jobId=job_id, state=mapping.get(st,"unknown"))
        return StatusResponse(jobId=job_id, state="open")
    except Exception:
        return StatusResponse(jobId=job_id, state="unknown")

# ---------- Routes ----------
@router.post("/plan", response_model=PlanResponse, dependencies=[Depends(require_api)])
async def plan(req: PlanRequest):
    # If you have a meta-agent planner, import and call it here; fallback is naive parse.
    # from your_planner_module import plan_text_to_intent
    # intent = plan_text_to_intent(req.text)
    intent = _naive_parse(req.text)
    p = intent.payload
    reward = p.reward or "1.0"
    days = p.deadlineDays if p.deadlineDays is not None else 7
    summary = f'I will post a job “{p.title}” with reward {reward} AGIALPHA and a {days}-day deadline. Proceed?'
    return PlanResponse(summary=summary, intent=intent, requiresConfirmation=True, warnings=[])

@router.post("/execute", response_model=ExecuteResponse, dependencies=[Depends(require_api)])
async def execute(req: ExecuteRequest):
    it = req.intent
    p = it.payload

    # POST JOB
    if it.action == "post_job":
        if not p.reward or Decimal(p.reward) <= 0:
            raise HTTPException(400, ERRORS["INSUFFICIENT_BALANCE"])
        if p.deadlineDays is None or p.deadlineDays <= 0:
            raise HTTPException(400, ERRORS["DEADLINE_INVALID"])

        # 1) Pin job spec to IPFS
        job_json = {
            "title": p.title or "New Job",
            "description": p.description or "",
            "attachments": [a.dict() for a in p.attachments],
            "rewardToken": "AGIALPHA",
            "reward": p.reward,
            "deadlineDays": p.deadlineDays
        }
        cid = await _pin_json(job_json)
        uri = f"ipfs://{cid}"
        reward_wei = _to_wei(p.reward)

        # 2) Wallet (expert) mode returns calldata, not executing server-side
        if req.mode == "wallet":
            to, data = _encode_wallet_call("postJob", [uri, AGIALPHA_TOKEN, reward_wei, int(p.deadlineDays)])
            return ExecuteResponse(ok=True, to=to, data=data, value="0x0", chainId=CHAIN_ID)

        # 3) Relayer mode (default)
        if not relayer:
            raise HTTPException(400, "Relayer not configured")
        func = registry.functions.postJob(uri, AGIALPHA_TOKEN, reward_wei, int(p.deadlineDays))
        tx = _build_tx(func, relayer.address)
        txh, receipt = await _send_relayer_tx(tx)
        job_id = _decode_job_created(receipt)
        return ExecuteResponse(
            ok=True,
            jobId=job_id,
            txHash=txh,
            receiptUrl=EXPLORER_TX_TPL.format(tx=txh)
        )

    # FINALIZE
    if it.action == "finalize_job":
        if p.jobId is None:
            raise HTTPException(400, "jobId required")

        if req.mode == "wallet":
            to, data = _encode_wallet_call("finalize", [int(p.jobId)])
            return ExecuteResponse(ok=True, to=to, data=data, value="0x0", chainId=CHAIN_ID)

        if not relayer:
            raise HTTPException(400, "Relayer not configured")
        func = registry.functions.finalize(int(p.jobId))
        tx = _build_tx(func, relayer.address)
        txh, _receipt = await _send_relayer_tx(tx)
        return ExecuteResponse(
            ok=True,
            jobId=int(p.jobId),
            txHash=txh,
            receiptUrl=EXPLORER_TX_TPL.format(tx=txh)
        )

    # CHECK STATUS (read-only)
    if it.action == "check_status":
        jid = int(p.jobId or 0)
        st = await _read_status(jid)
        # Not a mutation, but we keep response shape consistent
        return ExecuteResponse(ok=True, jobId=st.jobId)

    raise HTTPException(400, "unsupported action")

@router.get("/status", response_model=StatusResponse, dependencies=[Depends(require_api)])
async def status(jobId: int):
    return await _read_status(jobId)
