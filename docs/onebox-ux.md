# AGI Jobs One-Box UX & API contract

This document covers how the single-input One-Box interface interacts with the AGI-Alpha orchestrator (`AGI-Alpha-Agent-v0`) and hides blockchain complexity for end users.

## Overview

- **Front-end**: `apps/onebox/` — static HTML/CSS/JS that can be pinned to IPFS. It consumes the orchestrator over HTTPS.
- **Shared types**: `packages/onebox-sdk/` — TypeScript definitions for the planner/executor/status payloads.
- **Server**: extend the FastAPI app with `/onebox/plan`, `/onebox/execute`, `/onebox/status`.

Guest mode routes execution through the orchestrator relayer. Expert mode surfaces calldata so power users can sign with their own wallets (e.g. through viem/Web3Modal).

## API surface (FastAPI stubs)

Add the following endpoints to `AGI-Alpha-Agent-v0`:

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

Leverage the existing FastAPI `api.py` structure: include the router, reuse the `API_TOKEN` auth dependency, and expose the endpoints in the OpenAPI schema.

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

The UI ships with an error dictionary for common failure strings (`InsufficientBalance`, `deadline`, `allowance`, etc.). Ensure the orchestrator raises structured errors with either:

```json
{"error":"InsufficientBalance"}
```

or HTTP errors with readable `detail` fields. This allows the front-end to map them to human language without exposing low-level stack traces.

## Status updates

`/onebox/status` should aggregate:

- live chain reads from `JobRegistry`
- cached gateway events (`agent-gateway/` service)
- computed fields: `statusLabel`, `reward` (decimal string), `deadline` (humanised)

Return `jobs: [...]` with the latest entries first. Optional pagination can use `nextToken`.

## Deployment steps

1. Build and deploy the orchestrator with the new router.
2. Pin `apps/onebox/` to IPFS (or serve from any static host).
3. Set CORS on the orchestrator to allow the gateway origin and the IPFS gateway domain.
4. Share the orchestrator base URL with users; they configure it through the Settings modal.

## Related references

- Contracts v2 docs (`docs/`), especially identity and token configuration.
- `examples/ethers-quickstart.js` for calldata reference when preparing expert-mode transactions.
- `agent-gateway/` for event streaming.
