# One-Box Static Interface — Operator & User Guide

This guide explains how to run, configure, and operate the **AGI Jobs v0 One-Box** interface located at [`apps/onebox-static`](../apps/onebox-static/). The UI is intentionally static so it can be pinned to IPFS and delivered from any gateway while delegating planning and execution to the AGI-Alpha orchestrator. A lightweight build step now produces hashed bundles in `apps/onebox-static/dist` alongside a manifest that maps logical asset names to their cache-busted counterparts.

---

## 1. Architecture recap

```
User ↔ Static UI (IPFS) ↔ AGI-Alpha Orchestrator ↔ Execution Bridge (AA or Relayer) ↔ Ethereum (AGIJobsv0 v2)
```

- **Planner (`/onebox/plan`)**: accepts free-form text and returns either an **Intent-Constraint Schema (ICS)** or a higher-level JobIntent envelope.
- **Executor (`/onebox/execute`)**: consumes the ICS or JobIntent, simulates, and submits transactions via sponsored Account Abstraction (primary) or a relayer (fallback). Responses may stream back as Server-Sent Events (ICS flow) or return a JSON receipt (JobIntent flow).
- **Status (`/onebox/status`)**: provides a compact JSON feed of recent jobs that the UI renders in the live status board.

### Human-readable error handling

The static client ships with a **friendly error dictionary** (`FRIENDLY_ERROR_RULES` in [`lib.mjs`](../apps/onebox-static/lib.mjs)) that translates more than twenty common revert strings, HTTP responses, and wallet errors into actionable guidance (“**You don’t have enough AGIALPHA to fund this job. Tip: Lower the reward or top up your balance before trying again.**”). Keep the catalogue current whenever new orchestrator failure modes appear so end-users never see raw stack traces.
- **Static UI**: validates ICS, prompts the user for confirmations, uploads payloads to IPFS, and renders human-readable receipts.

---

## 2. Operator checklist

| Step | Action | Notes |
| ---- | ------ | ----- |
| 1 | Deploy or configure the AGI-Alpha orchestrator | Ensure the AGI Jobs toolchain is enabled and populated with v2 contract addresses, ENS policy, and `$AGIALPHA` metadata. |
| 2 | Configure CORS | Allow origins where the IPFS gateway will serve the UI, e.g. `https://w3s.link` or custom gateways. |
| 3 | Set Account Abstraction credentials | Provision a bundler and sponsored Paymaster (Alchemy Account Kit or equivalent). Stake and fund them according to ERC-4337 requirements. |
| 4 | Configure relayer fallback | If AA is unavailable, create an OpenZeppelin Defender Relayer with contract/function allowlists and daily spend caps. |
| 5 | Configure orchestrator IPFS pinning | Set `PINNER_TOKEN` (and optional `PINNER_ENDPOINT`) so the server can pin metadata through web3.storage or your chosen provider. |
| 6 | Populate [`apps/onebox-static/config.js`](../apps/onebox-static/config.js) | Update planner/executor URLs, AA chainId, and bundler label. |
| 7 | Generate web3.storage tokens | Issue per-origin tokens to team members; tokens stay in-browser. Consider revocation schedules. |
| 8 | Build the hashed static bundle | Run `npm run onebox:static:build` to populate `apps/onebox-static/dist`. |
| 9 | Pin the generated bundle to IPFS | `web3 storage upload apps/onebox-static/dist` or your preferred pinning workflow. |
| 10 | Share gateway URL & monitor | Provide the gateway link to users, monitor orchestrator logs, and top-up the Paymaster balance. |

### Safe & governance handover (optional)

- If operators prefer a multi-signature Safe to manage Paymaster deposits and relayer keys, rotate Paymaster ownership to the Safe and share runbooks for replenishment and revocation.
- Document admin-only intents (e.g., `admin_set`) and confirm orchestrator-side checks align with Safe signer policies.

---

## 3. User flow (walletless UX)

1. Navigate to the published gateway URL (e.g., `https://w3s.link/ipfs/<CID>/index.html`).
2. Describe your request in the single input box. Examples:
   - “Post a labeling job for 500 images, reward 50 AGIALPHA, due in 7 days.”
   - “Apply for job #123.”
   - “Finalize job #123.”
3. The orchestrator responds with clarifying questions if required fields are missing. The UI echoes them in the chat feed.
4. When the ICS would move tokens or stake, the UI shows a ≤140-character confirmation line (“Post job 50 AGIALPHA, 7 days, fee 5%, burn 2%?”). Respond with **YES** to continue or **NO** to cancel.
5. For jobs or submissions requiring attachments, the UI triggers a file picker and uploads the file to IPFS via web3.storage. The CID is inserted into the ICS before execution.
6. Execution status and receipts stream into the chat. Advanced details (tx hash, block number, AA/relayer metadata) appear under the **Advanced** toggle.
7. A live status board underneath the chat polls `/onebox/status` for recent jobs so users can rejoin ongoing workflows without refreshing.

### ENS enforcement

- If the orchestrator indicates that ENS identity is mandatory (`*.agent.agi.eth` or `*.club.agi.eth`), the confirmation summary explains the requirement and suggests the appropriate claim/associate flow before continuing.

---

## 4. Account Abstraction (AA) configuration

1. Create an ERC-4337 smart account + Paymaster setup using Alchemy’s Account Kit or similar.
2. Fund the Paymaster and ensure `sponsorUserOperation` is gated by:
   - Allowed target contract addresses (AGIJobsv0 v2 modules only).
   - Spend caps per intent (`create_job`, `stake`, etc.).
   - Rate limiting keyed by `meta.traceId` or end-user fingerprinting headers.
3. Point [`AA_MODE`](../apps/onebox-static/config.js) to the desired chainId (e.g., 8453 for Base).
4. The orchestrator should simulate every `UserOperation` before submit and surface errors back through SSE.

### Relayer fallback

- Configure an OpenZeppelin Defender Relayer with scoped API keys. The orchestrator should call the relayer only when `AA_MODE.enabled` is `false`.
- Defender allows function-specific policies; restrict to the v2 contract selectors.
- Include replay protection (trace id + nonce) and log correlation to the ICS meta trace.

---

## 5. Automated publishing & ENS updates

The `apps/onebox-static/scripts/publish.mjs` helper (surfaced as `npm run onebox:static:publish`) automates the full release flow:

1. Unless `--skip-build` is supplied, it executes the hashed asset build (`npm run onebox:static:build`) and integrity audit (`npm run verify:sri`).
2. It packs `dist/` into a deterministic CAR file, uploads the archive to web3.storage, and requests a redundant Pinata pin (each step can be disabled with `--skip-web3` or `--skip-pinata`).
3. When ENS credentials are provided it sets the contenthash for the configured name and probes every configured gateway plus the `.limo` URL to measure cold-load performance against the 99.9% availability SLO (skip with `--skip-ens` or `--skip-health`).

On success the script prints the root CID, known gateways, the ENS transaction hash, and the live `eth.limo` URL for handoff. It also writes `apps/onebox-static/dist/release.json` **and** updates `deployment-config/onebox-static.json` with a `latest` snapshot plus a rolling `history` array so SLO dashboards can track when each revision went live and which gateways should be probed.

### Required secrets & environment

| Variable | Purpose | Source |
| -------- | ------- | ------ |
| `WEB3_STORAGE_TOKEN` *(or `W3S_TOKEN`)* | API token for web3.storage uploads and pin verification. | web3.storage console (scoped to static hosting uploads). |
| `PINATA_JWT` *(or `PINATA_API_KEY` + `PINATA_SECRET_API_KEY`)* | Credentials used to request a redundant pin via Pinata. | Pinata API keys. |
| `PINATA_HOST_NODES` *(optional)* | Comma-separated multiaddrs to hint preferred Pinata pinning nodes. | Pinata gateway configuration. |
| `ENS_NAME` *(or `ONEBOX_ENS_NAME`)* | ENS name that should resolve to the published bundle (e.g., `onebox.alice.eth`). | ENS delegation plan. |
| `ENS_PRIVATE_KEY` *(or `ONEBOX_ENS_PRIVATE_KEY`)* | Hex-encoded private key authorised to update the ENS resolver. Store in a secure secret manager. | Deployment signer. |
| `ENS_RPC_URL` *(or `ONEBOX_ENS_RPC_URL`)* | HTTPS RPC endpoint for the target network (e.g., Base mainnet). | Alchemy, Infura, or in-house node. |
| `ENS_RESOLVER` *(optional)* | Resolver contract that exposes `setContenthash` if the default lookup should be overridden. | ENS registry/resolver configuration. |
| `ONEBOX_RELEASE_LABEL` *(optional)* | Override for the default timestamp-based release name (useful for CI tagging). | Release automation. |

Ensure the signer has the necessary permissions on the resolver before running the release script.

### Release metadata & monitoring

- `deployment-config/onebox-static.json` now tracks the most recent release plus a rolling `history` array that captures the CID, release timestamp, ENS tx hash, and gateway URLs. Wire your uptime/SLO monitors to read this file and probe each gateway listed for the latest CID.
- The script’s console output includes the canonical `https://<ens>.eth.limo` link that should be distributed to operators and end users.
- Store the generated `apps/onebox-static/dist/manifest.json` with the pinned content so hashed asset names remain valid for gateways.

---

## 6. Troubleshooting

| Symptom | Possible cause | Resolution |
| ------- | -------------- | ---------- |
| “Planner unavailable” | Incorrect `PLAN_URL`, orchestrator offline, or CORS blocked. | Verify URL, check orchestrator logs, adjust CORS origins. |
| “Demo mode is active” | No orchestrator base URL configured. | Open the Advanced panel, set the orchestrator base URL/prefix, or supply `?orchestrator=...` in the page URL. |
| “Executor error” | `/onebox/execute` rejected the request or the SSE stream failed. | Inspect orchestrator logs; ensure AA Paymaster funded and ICS passes validation. |
| “web3.storage token required” | Token not set in browser. | Obtain token from operator, paste when prompted, or clear via `localStorage.removeItem("W3S_TOKEN")`. |
| ENS requirement message | Identity registry enforced. | Follow the provided claim/associate instructions before retrying. |

---

## 7. Extensibility

- ICS schema and guardrails live entirely in the orchestrator + [`lib.mjs`](../apps/onebox-static/lib.mjs); add new intents by updating both ends while preserving backwards compatibility.
- Additional tool metadata can flow via `ics.meta` without UI changes; the Advanced panel renders raw strings supplied in SSE events.
- If future versions require analytics, add privacy-preserving hooks that batch events server-side instead of embedding trackers in the static bundle.

---

## 8. Support contacts

- **Orchestrator Ops:** maintainers of the AGI-Alpha deployment.
- **Protocol Ops:** AGI Jobs core team (contract upgrades, fee knob changes).
- **Security:** rotate Paymaster & relayer credentials via Safe signers; maintain alerting on unusual spend or repeated denials.

