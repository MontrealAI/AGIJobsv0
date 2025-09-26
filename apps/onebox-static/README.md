# AGI Jobs One-Box (Static UI)

A single-input, gasless, walletless interface that talks to the AGI-Alpha Meta-Agent orchestrator and executes against the AGIJobsv0 v2 contracts. The bundle is IPFS-ready (no build step) and relies on standards-based ES modules.

## Features

- Natural-language chat surface that calls `/plan` and `/execute` on the AGI-Alpha orchestrator.
- Client-side ICS (Intent-Constraint Schema) validation and guardrails for the supported AGI Jobs intents.
- Two-step confirmations for value-moving transactions.
- Integrated IPFS pinning using [`web3.storage`](https://docs-beta.web3.storage/getting-started/w3up-client/).
- Advanced receipts toggle exposing transaction hashes, gas sponsorship info, and raw ICS payloads.
- Drag-and-drop attachment support (plus orchestrator prompts) with client-side IPFS pinning backed by `web3.storage`.
- Neutral static hosting footprint suited for IPFS pinning.

## Quick start

1. Run or obtain an AGI-Alpha orchestrator endpoint (see [AGI-Alpha-Agent-v0](https://github.com/MontrealAI/AGI-Alpha-Agent-v0)). Ensure CORS allows the origin the static page will be served from.
2. Update [`config.js`](./config.js) with your orchestrator URLs, desired Account Abstraction settings, and any alternate IPFS gateways you want the Advanced receipts panel to surface.
3. (Optional) Prepare web3.storage API tokens for team members. Tokens are stored client-side in `localStorage`.
4. Serve the directory locally for development, e.g.:

   ```bash
   npx serve apps/onebox-static
   ```

5. Pin the folder to IPFS when ready for production. `web3.storage` CLI example:

   ```bash
   web3 storage upload apps/onebox-static
   ```

   Record the CID for gateway access, e.g. `https://w3s.link/ipfs/<CID>/index.html`.

## Orchestrator contract configuration

The orchestrator is expected to encapsulate the v2 contract ABIs and addresses and to expose two HTTPS endpoints:

- `POST /plan`: accepts `{ message, history }` and returns a validated ICS object (see `/docs` in the orchestrator).
- `POST /execute`: accepts `{ ics, aa }` and streams Server-Sent Events describing status updates, confirmations, receipts, and errors.

The client enforces the intent allowlist defined in [`lib.mjs`](./lib.mjs). Owner-only operations must be blocked server-side unless the orchestrator verifies the caller is authorised.

## Account Abstraction & relayer notes

- `AA_MODE.enabled = true` enables the ERC-4337 path. The orchestrator should construct sponsored `UserOperation`s via an Account Abstraction SDK such as [Alchemy’s aa-sdk](https://github.com/alchemyplatform/aa-sdk).
- If AA is unavailable, set `AA_MODE.enabled = false` and let the orchestrator use an alternative relayer (e.g. OpenZeppelin Defender). Receipts should still stream through `/execute`.
- Always simulate transactions before final submission and enforce spend caps per ICS trace id.

## ENS-aware messaging

When the orchestrator returns ICS metadata indicating that an ENS identity is required, the UI will reflect this in the confirmation summary. Ensure the orchestrator uses plain-language guidance (≤140 characters) so the confirmation message stays concise.

## Security considerations

- Secrets such as Paymaster private keys must **not** be embedded in this static bundle. Restrict orchestrator endpoints with allowlists and throttling.
- `web3.storage` tokens are retained in the user’s browser only. Encourage operators to issue per-origin scoped tokens.
- The UI enforces a maximum history window (`HISTORY_LENGTH`) to limit prompt size; the orchestrator should also cap history depth.
- Validate all ICS payloads server-side even if the client performs its own checks.

## Utility helpers

- [`toWei`](./lib.mjs) converts human-readable AGIALPHA amounts into 18-decimal `BigInt` values for simulations and spend-cap checks.
- [`formatAGIA`](./lib.mjs) renders on-chain balances back into concise human units, trimming trailing decimals by default.

## Testing suggestions

- Use Playwright to drive the static page through the “micro-job” happy path described in the main product spec.
- Mock the orchestrator endpoints locally for unit testing ICS validation and confirmation flows.

## Deployment via IPFS

1. Confirm accessibility of orchestrator URLs via HTTPS from the target gateway.
2. Upload the contents of `apps/onebox-static` to IPFS (web3.storage, Pinata, or similar).
3. Optionally configure DNSLink for a custom domain pointing to the CID.
4. Monitor orchestrator logs and paymaster balances; rotate tokens regularly.

## Resetting local state

Use the browser console to clear cached settings:

```js
localStorage.removeItem("W3S_TOKEN");
```

This forces the token prompt to reappear on the next upload attempt.
