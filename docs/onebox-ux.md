# AGI Jobs One-Box UX & API contract

This document covers how the single-input One-Box interface interacts with the AGI-Alpha orchestrator (`AGI-Alpha-Agent-v0`) and hides blockchain complexity for end users.

## Overview

- **Front-end**: `apps/onebox/` — static HTML/CSS/JS that can be pinned to IPFS. It consumes the orchestrator over HTTPS.
- **Shared types**: `packages/onebox-sdk/` — TypeScript definitions for the planner/executor/status payloads.
- **Server**: extend the FastAPI app with `/onebox/plan`, `/onebox/execute`, `/onebox/status`.

Guest mode routes execution through the orchestrator relayer. Expert mode surfaces calldata so power users can sign with their own wallets (e.g. through viem/Web3Modal).

The static bundle also exposes runtime configuration controls: operators can change the orchestrator base URL/prefix from the **Advanced** panel or via `?orchestrator=...&oneboxPrefix=...` query parameters. When unset, the client drops into a demo mode that simulates planner/executor responses without hitting the blockchain.

## API surface (FastAPI stubs)

Add the following endpoints to `AGI-Alpha-Agent-v0` (or reuse the ready-made Express router in `apps/orchestrator/oneboxRouter.ts`).
A production-ready FastAPI router now ships in [`routes/onebox.py`](../routes/onebox.py); mount it directly on the existing API server to gain `/onebox/plan`, `/onebox/execute`, `/onebox/status`, `/onebox/healthz`, and `/onebox/metrics` with Prometheus instrumentation:

```py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/onebox", tags=["onebox"])

class PlanRequest(BaseModel):
    text: str
    expert: bool = False

class ExecuteRequest(BaseModel):
    intent: JobIntent  # reuse schema from packages/onebox-sdk
    mode: Literal['relayer', 'wallet'] = 'relayer'

@router.post('/plan', response_model=PlanResponse)
async def plan(req: PlanRequest, deps=Depends(auth_guard)):
    intent = await planner.run(text=req.text, expert=req.expert)
    return PlanResponse(summary=intent.summary, intent=intent, warnings=intent.warnings)

@router.post('/execute', response_model=ExecuteResponse)
async def execute(req: ExecuteRequest, deps=Depends(auth_guard)):
    if req.mode == 'relayer':
        result = await relayer.execute(req.intent)
    else:
        result = await wallet.prepare_calldata(req.intent)
    if not result.ok:
        raise HTTPException(status_code=400, detail=result.error)
    return result

@router.get('/status', response_model=StatusResponse)
async def status(job_id: int | None = None, deps=Depends(auth_guard)):
    return await status_service.fetch(job_id=job_id)
```

The Python implementation (`routes/onebox.py`) exposes the same `/onebox/plan`, `/onebox/execute`, and `/onebox/status` endpoints along with `GET /onebox/healthz` and a Prometheus-ready `GET /onebox/metrics` surface. It also normalises planner output (reward and deadline inference, optional agent type hints) and decodes packed on-chain metadata for `/status` responses.

If you prefer TypeScript, run `ts-node --project apps/orchestrator/tsconfig.json apps/orchestrator/onebox-server.ts` to start the bundled Express service. It exposes `/onebox/*` plus `/healthz` and can be configured via:

- `ONEBOX_RELAYER_PRIVATE_KEY`: signer used for guest/relayer execution.
- `ONEBOX_PORT`: HTTP port (default `8080`).
- `ONEBOX_EXPLORER_TX_BASE`: optional block explorer prefix for receipt links.
- `ONEBOX_STATUS_LIMIT`: number of recent jobs returned by `/onebox/status`.
- `ONEBOX_CORS_ALLOW`: CORS origin (default `*`).

### FastAPI / Python environment variables

When running the FastAPI router from [`routes/onebox.py`](../routes/onebox.py), configure the orchestrator with:

- `RPC_URL`, `CHAIN_ID`, `JOB_REGISTRY`, `AGIALPHA_TOKEN`: canonical chain information.
- `ONEBOX_RELAYER_PRIVATE_KEY`: optional relayer signer for walletless execution (omit to require wallet mode).
- `ONEBOX_API_TOKEN`: bearer token expected on every `/onebox/*` request.
- `ONEBOX_EXPLORER_TX_BASE`: transaction receipt template (defaults to `https://explorer.example/tx/{tx}`).
- `PINNER_KIND`, `PINNER_ENDPOINT`, `PINNER_TOKEN`: IPFS pinning backend configuration.
- `AGIALPHA_DECIMALS`: token decimals (defaults to `18`, matching `config/agialpha.json`).

Leverage the existing FastAPI `api.py` structure or the Express server: include the router, reuse the `API_TOKEN` auth dependency, and expose the endpoints in the OpenAPI schema.

Both routers ship with `GET /onebox/metrics`, which emits Prometheus-compatible counters for planner, executor, and status calls (plus per-intent labels for execution).

## Planner → executor contract

The planner must output a `JobIntent` structure:

```json
{
  "action": "post_job",
  "payload": {
    "title": "Label 500 images",
    "description": "Binary labels; examples attached",
    "reward": "5.0",
    "rewardToken": "AGIALPHA",
    "deadlineDays": 7,
    "attachments": [{"name": "guidelines.pdf", "ipfs": "bafy..."}]
  },
  "constraints": {"maxFee": "auto"},
  "userContext": {"sessionId": "uuid"}
}
```

`packages/onebox-sdk` exports matching TypeScript interfaces, which keeps UI, orchestrator, and tooling aligned.

## Error handling

The UI ships with an error dictionary for common failure strings (`INSUFFICIENT_BALANCE`, `DEADLINE_INVALID`, `REQUEST_EMPTY`, etc.). Ensure the orchestrator raises structured errors with either:

```json
{"error":"InsufficientBalance"}
```

or HTTP errors with readable `detail` fields. This allows the front-end to map them to human language without exposing low-level stack traces.

## Status updates

`/onebox/status` should aggregate live chain reads from `JobRegistry` (state, deadline, assignee) and, when available, cached gateway events from `agent-gateway/`. The default router decodes packed metadata so every response includes `state`, `reward`, `token`, `deadline`, and `assignee` with sub-300 ms reads. Extend with pagination tokens if you expose multi-job feeds.

## Deployment steps

1. Build and deploy the orchestrator with the new router.
2. Pin `apps/onebox/` to IPFS (or serve from any static host).
3. Set CORS on the orchestrator to allow the gateway origin and the IPFS gateway domain.
4. Share the orchestrator base URL with users; they configure it through the Settings modal.

## Related references

- Contracts v2 docs (`docs/`), especially identity and token configuration.
- `examples/ethers-quickstart.js` for calldata reference when preparing expert-mode transactions.
- `agent-gateway/` for event streaming.
