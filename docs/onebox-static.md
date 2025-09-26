# One-Box Static Interface — Operator & User Guide

This guide explains how to run, configure, and operate the **AGI Jobs v0 One-Box** interface located at [`apps/onebox-static`](../apps/onebox-static/). The UI is intentionally static so it can be pinned to IPFS and delivered from any gateway while delegating planning and execution to the AGI-Alpha orchestrator.

---

## 1. Architecture recap

```
User ↔ Static UI (IPFS) ↔ AGI-Alpha Orchestrator ↔ Execution Bridge (AA or Relayer) ↔ Ethereum (AGIJobsv0 v2)
```

- **Planner (`/plan`)**: accepts free-form text and returns an **Intent-Constraint Schema (ICS)**.
- **Executor (`/execute`)**: consumes the ICS, simulates, and submits transactions via sponsored Account Abstraction (primary) or a relayer (fallback). Responses stream back as Server-Sent Events.
- **Static UI**: validates ICS, prompts the user for confirmations, uploads payloads to IPFS, and renders human-readable receipts.

---

## 2. Operator checklist

| Step | Action | Notes |
| ---- | ------ | ----- |
| 1 | Deploy or configure the AGI-Alpha orchestrator | Ensure the AGI Jobs toolchain is enabled and populated with v2 contract addresses, ENS policy, and `$AGIALPHA` metadata. |
| 2 | Configure CORS | Allow origins where the IPFS gateway will serve the UI, e.g. `https://w3s.link` or custom gateways. |
| 3 | Set Account Abstraction credentials | Provision a bundler and sponsored Paymaster (Alchemy Account Kit or equivalent). Stake and fund them according to ERC-4337 requirements. |
| 4 | Configure relayer fallback | If AA is unavailable, create an OpenZeppelin Defender Relayer with contract/function allowlists and daily spend caps. |
| 5 | Populate [`apps/onebox-static/config.js`](../apps/onebox-static/config.js) | Update planner/executor URLs, AA chainId, and bundler label. |
| 6 | Generate web3.storage tokens | Issue per-origin tokens to team members; tokens stay in-browser. Consider revocation schedules. |
| 7 | Pin the static bundle to IPFS | `web3 storage upload apps/onebox-static` or your preferred pinning workflow. |
| 8 | Share gateway URL & monitor | Provide the gateway link to users, monitor orchestrator logs, and top-up the Paymaster balance. |

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

## 5. Publishing to IPFS

```bash
# From repository root
web3 storage upload apps/onebox-static
```

- Store the resulting CID in deployment notes.
- Optionally pin via multiple providers for resiliency.
- Configure DNSLink (`_dnslink.example.com` TXT record) for custom domains.

---

## 6. Troubleshooting

| Symptom | Possible cause | Resolution |
| ------- | -------------- | ---------- |
| “Planner unavailable” | Incorrect `PLAN_URL`, orchestrator offline, or CORS blocked. | Verify URL, check orchestrator logs, adjust CORS origins. |
| “Executor error” | `/execute` rejected the ICS or SSE stream failed. | Inspect orchestrator logs; ensure AA Paymaster funded and ICS passes validation. |
| “web3.storage token required” | Token not set in browser. | Obtain token from operator, paste when prompted, or clear via `localStorage.removeItem("W3S_TOKEN")`. |
| ENS requirement message | Identity registry enforced. | Follow the provided claim/associate instructions before retrying. |

---

## 7. Extensibility

- ICS schema and guardrails live entirely in the orchestrator + [`lib.js`](../apps/onebox-static/lib.js); add new intents by updating both ends while preserving backwards compatibility.
- Additional tool metadata can flow via `ics.meta` without UI changes; the Advanced panel renders raw strings supplied in SSE events.
- If future versions require analytics, add privacy-preserving hooks that batch events server-side instead of embedding trackers in the static bundle.

---

## 8. Support contacts

- **Orchestrator Ops:** maintainers of the AGI-Alpha deployment.
- **Protocol Ops:** AGI Jobs core team (contract upgrades, fee knob changes).
- **Security:** rotate Paymaster & relayer credentials via Safe signers; maintain alerting on unusual spend or repeated denials.

