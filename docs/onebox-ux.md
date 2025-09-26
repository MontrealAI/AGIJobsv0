# One-Box UX Overview

The One-Box interface provides a single input surface that turns natural language instructions into AGI Jobs intents executed through the AGI-Alpha orchestrator. This document summarises how the static client, orchestrator routes, and blockchain abstractions fit together so that contributors can ship updates quickly.

## Architecture

```
+--------------+        +--------------------+        +-----------------------+
|  One-Box UI  |  -->   |  Orchestrator API  |  -->   |  AGI Jobs v2 Contracts |
| (static HTML) |        | (/onebox endpoints) |        |  + agent-gateway cache  |
+--------------+        +--------------------+        +-----------------------+
```

- **UI** — A static HTML/CSS/JS bundle that can be pinned to IPFS. It never holds secrets and defaults to a relayer-backed execution mode. Expert users can toggle wallet signing without reloading the page.
- **Orchestrator** — FastAPI server extended with `/onebox/plan`, `/onebox/execute`, and `/onebox/status`. It validates intents, performs IPFS pinning, and routes transactions through a relayer or ERC-4337 adapter.
- **Contracts** — Re-use the v2 deployments under `contracts/v2`. The orchestrator should use the shared token and identity configuration in `config/agialpha.json` and the registry tooling.

## Planner Contract

All orchestrator responses conform to the TypeScript types defined in `packages/onebox-sdk`. These types mirror the JSON payloads used by the UI and can be consumed by other tooling (CLI, tests, etc.).

- `JobIntent` captures the planned action.
- `PlanResponse` wraps human-readable summaries and warnings.
- `ExecuteResponse` returns job identifiers and receipts.

## Status & Events

The orchestrator can provide responsive status updates by combining on-chain reads (`JobRegistry` view methods) with the existing agent gateway event stream. The static client polls `/onebox/status` as needed to update status cards without exposing raw blockchain concepts to end-users.

## Deployment Notes

1. Pin the contents of `apps/onebox-static/v2/` to IPFS or host on any static provider.
2. Configure CORS on the orchestrator to permit the chosen domain/gateway.
3. Use the environment variables already present in AGI-Alpha (`API_TOKEN`, optional `PINNER_TOKEN`) to secure planner and executor calls.
4. Document the orchestrator URL and network in the deployment runbook so operators can rotate relayer keys and tokens safely.

## Roadmap Hooks

- **Error dictionary** — Extend the client-side copy to map low-level execution errors into human language.
- **Telemetry** — Stream anonymised UI events to a metrics sink once `/metrics` is exposed server-side.
- **Testing** — Add Cypress flows that cover confirm/cancel, Expert Mode toggling, and orchestrator integration mocks.
