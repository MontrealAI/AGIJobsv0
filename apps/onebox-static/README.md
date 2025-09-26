# AGI Jobs One-Box (Static UI)

A single-textbox, gasless, walletless interface for AGI Jobs v2 that runs entirely from static hosting (e.g. IPFS). The page talks to the AGI-Alpha Orchestrator for natural-language planning and streams execution receipts through either an Account Abstraction (ERC-4337) path or a Defender relayer fallback.

## Features

- **One input box** with streaming responses and an advanced details toggle for receipts and diagnostics.
- **ICS guardrails** – planner responses are validated client-side (intent allowlist, confirmation summaries ≤160 chars, trace IDs).
- **Gasless execution** – delegates to the orchestrator for AA-sponsored user operations or relayer fallbacks.
- **IPFS integration** – job specs, submissions, and dispute evidence are pinned via `web3.storage` straight from the browser.
- **ENS awareness** – dedicated event type for orchestrator hints to walk users through identity requirements.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Minimal shell (HTML/CSS) for the chat surface, advanced panel, and accessibility hooks. |
| `app.mjs` | Main ES module orchestrating user interactions, planner calls, confirmations, IPFS uploads, and execution streaming. |
| `config.mjs` | Environment-specific endpoints and AA toggle. |
| `lib.mjs` | Shared helpers: ICS validation, event formatting, AA summary helpers, IPFS utilities. |

## Quick start (local)

1. Serve the directory with any static server, e.g. `npx serve apps/onebox-static`.
2. Update `config.mjs` with your orchestrator endpoints (and optional AA configuration).
3. In the UI’s **Advanced** panel set a `web3.storage` token (stored locally) if you plan to upload attachments.
4. Type natural-language requests. When value moves, you will be prompted for a `YES/NO` confirmation capped at 160 characters.

## Publishing to IPFS

1. Ensure `config.mjs` points at publicly reachable orchestrator endpoints with CORS enabled for the gateway you plan to use.
2. From the project root run:
   ```bash
   npx web3.storage upload apps/onebox-static
   ```
   or upload the folder manually via the [web3.storage dashboard](https://web3.storage/).
3. Pin the returned CID and share `https://w3s.link/ipfs/<CID>/index.html` (or configure DNSLink for a custom domain).
4. Optional: pre-populate `config.mjs` with production endpoints, then pin the folder for an immutable deployment.

## User guide (walletless UX)

- **Plan** – describe the action (“Post a labeling job for 500 images, 50 AGIALPHA, 7 days”). The orchestrator returns an Intent-Constraint Schema (ICS) payload which is validated in-browser.
- **Confirm** – if the action moves AGIALPHA or affects stake, you’ll see a ≤160 character summary. Reply `YES` to proceed or anything else to cancel.
- **Execute** – receipts stream back with plain-language updates. Enable the **Advanced** toggle to view tx hashes, block numbers, or ENS guidance supplied by the orchestrator.
- **Attachments** – drag/drop or browse a file. The UI pins it to IPFS (requires a `web3.storage` token) and injects the resulting CID into the ICS before execution.

## Operator runbook

1. **Meta-agent (planner)** – run the AGI-Alpha orchestrator and expose `/plan` + `/execute`. Ensure responses include `meta.traceId` and confirmations for value-moving intents.
2. **Account Abstraction (primary path)**
   - Configure a bundler & paymaster (e.g. Alchemy Account Kit) with spend limits per origin.
   - Set `AA_MODE = { enabled: true, bundler: "alchemy", chainId: <chain> }` in `config.mjs`.
   - Simulator/guardrails live server-side: every user operation must be simulated before broadcast.
3. **Relayer fallback**
   - Provision an OpenZeppelin Defender Relayer (or equivalent) with function allowlists and daily spend caps.
   - In `/execute`, switch to relayer mode when AA sponsorship is unavailable, while keeping receipts consistent.
4. **ENS enforcement**
   - When the Identity Registry requires `*.agent.agi.eth` or `*.club.agi.eth`, emit `type:"ens_requirement"` events with human guidance. The UI surfaces these as 🔐 notices.
5. **Monitoring**
   - Use the `meta.traceId` echoed back from the UI to correlate planner decisions, simulations, and final receipts.

## Security notes

- The static bundle contains **no private keys**. Paymaster / relayer credentials must live in the orchestrator environment.
- ICS validation prevents unsupported intents from reaching the executor. Owner-only commands should be gated server-side as well.
- The `web3.storage` token is stored in `localStorage` under `AGIJOBS_W3S_TOKEN`; clearing the token from the Advanced panel prevents further uploads.
- Always pin specs and evidence before execution to avoid missing metadata.

## Safe governance handover (optional)

If operators delegate control to a Safe (multisig), ensure:

- Owner-only intents in the planner map to Safe module calls with explicit confirmations.
- The orchestrator simulates both the Safe transaction and underlying module calls before prompting the user.
- Receipts include Safe tx hashes in the advanced panel so signers can reconcile approvals.

## Troubleshooting

- **Planner unavailable** – the UI shows `Planner unavailable (<status>)`; verify orchestrator URL/CORS and retry.
- **Missing IPFS token** – set the `web3.storage` token from the Advanced panel; uploads resume automatically.
- **ENS blocked** – follow the 🔐 instructions (claim the required subdomain or associate an address) before re-sending the intent.
- **Slow receipts** – check bundler/relayer health; the SSE stream stays open until the orchestrator completes execution.

