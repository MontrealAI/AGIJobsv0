# AGI Jobs v2 – One-Box UX

This document describes the single-input “one-box” experience that layers on top of the existing AGI Jobs v2 stack. The goal is to let non-crypto native employers describe work in natural language, confirm a human-readable plan, and rely on the orchestrator to post and manage jobs on-chain without surfacing blockchain abstractions by default.

## Overview

- **Front-end**: static bundle under [`apps/onebox/static/`](../apps/onebox/static/) that can be served from IPFS or any static host. It renders a chat-style timeline with a single input box, contextual prompt chips, and an optional expert mode for wallet signing.
- **Orchestrator**: AGI-Alpha-Agent-v0 exposes `/onebox/plan`, `/onebox/execute`, and `/onebox/status` routes. The planner turns natural language into a structured intent; the executor performs relayed transactions or returns typed calldata for expert mode clients; the status endpoint merges on-chain reads with the agent-gateway event cache.
- **Identity & token policy**: unchanged. Agents and validators still rely on the ENS subdomain registry (`*.agent.agi.eth`, `*.club.agi.eth`) and $AGIALPHA remains the canonical reward token defined in [`config/agialpha.json`](../config/agialpha.json).

## Front-end behaviour

1. **Planning** – Text is POSTed to `/onebox/plan`. The response contains a human-readable summary and a `JobIntent` payload. In demo mode (no orchestrator URL configured) the page synthesises intents locally so the UI can be previewed offline.
2. **Confirmation** – Users accept or cancel the proposed plan. Acceptance triggers `/onebox/execute` with either `mode="relayer"` (default walletless flow) or `mode="wallet"` (expert mode, where the API can reply with calldata for the connected signer).
3. **Execution feedback** – Successful responses surface the resulting job identifier and an optional transaction receipt URL. Failures are mapped to humanised error messages so users never see raw revert strings.

### Expert mode

- Disabled by default and clearly labelled in the header badge.
- When toggled, the UI swaps execution mode to `wallet` while retaining every other orchestration step, enabling advanced users to review and sign transactions locally via Web3Modal/viem integrations added in future iterations.

## Configuration

- Set `localStorage.ORCH_URL` to the orchestrator base URL (for example `https://alpha-orchestrator.example`) or append `#orch=<encoded-url>` to the IPFS gateway link once, which persists the value in local storage.
- The orchestrator must enable CORS for the IPFS gateway origins and protect the routes with the existing `API_TOKEN` and rate limiting described in the AGI-Alpha-Agent-v0 documentation.

## Hosting

The contents of `apps/onebox/` are self-contained and require no build step. Pin the folder to IPFS and publish the resulting CID through your preferred gateway. Because the front-end is static, no secrets are exposed and the same bundle can be reused across environments by pointing it at different orchestrator URLs.

## Next steps

- Extend the orchestrator to expose typed error codes so the front-end can show tailored remediation messages for common failure states (insufficient balance, invalid deadline, etc.).
- Integrate the agent-gateway job stream into a right-rail status card for live updates without polling.
- Add Cypress smoke tests that cover confirmation flows, demo mode, and expert mode toggling.
