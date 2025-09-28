# AGI Jobs One-Box (Static UI)

A single-input, gasless, walletless interface that talks to the AGI-Alpha Meta-Agent orchestrator and executes against the AGIJobsv0 v2 contracts. The bundle is produced via a small build step that emits hashed, cache-friendly assets for IPFS pinning.

## Features

- Natural-language chat surface that calls `/onebox/plan` and `/onebox/execute` on the AGI-Alpha orchestrator.
- Client-side ICS (Intent-Constraint Schema) validation and guardrails for the supported AGI Jobs intents.
- Two-step confirmations for value-moving transactions.
- Integrated IPFS pinning using [`web3.storage`](https://docs-beta.web3.storage/getting-started/w3up-client/).
- Advanced receipts toggle exposing transaction hashes, gas sponsorship info, and raw ICS payloads.
- Drag-and-drop attachment support (plus orchestrator prompts) with client-side IPFS pinning backed by `web3.storage`.
- Live job status board that polls `/onebox/status` for recent updates and renders walletless receipts.
- Runtime-configurable orchestrator endpoint with a demo-mode fallback for offline testing.
- Human-readable error dictionary that turns common revert strings and HTTP failures into actionable guidance.
- Neutral static hosting footprint suited for IPFS pinning.

## Quick start

1. Run or obtain an AGI-Alpha orchestrator endpoint (see [AGI-Alpha-Agent-v0](https://github.com/MontrealAI/AGI-Alpha-Agent-v0)). Ensure CORS allows the origin the static page will be served from.
   - Configure orchestrator environment variables such as `PINNER_TOKEN` (and optional `PINNER_ENDPOINT`) so server-side executions can pin metadata through your chosen IPFS service.
2. Update [`config.js`](./config.js) with your orchestrator URLs (base + `/onebox` prefix), desired Account Abstraction settings, and any alternate IPFS gateways you want the Advanced receipts panel to surface.
3. (Optional) Prepare web3.storage API tokens for team members. Tokens are stored client-side in `localStorage`.
4. Build the production bundle with hashed asset names:

   ```bash
   npm run onebox:static:build
   ```

5. Serve the generated bundle locally for development validation, e.g.:

   ```bash
   npx serve apps/onebox-static/dist
   ```

6. Pin the `dist/` folder to IPFS when ready for production. `web3.storage` CLI example:

   ```bash
   web3 storage upload apps/onebox-static/dist
   ```

   Record the CID for gateway access, e.g. `https://w3s.link/ipfs/<CID>/index.html`.

The build emits a `manifest.json` inside `dist/` that records the hashed filenames used by `index.html`.

## Content Security Policy

- The production HTML template embeds a restrictive CSP meta tag: `default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self' https://alpha-orchestrator.example.com https://api.web3.storage https://w3s.link https://ipfs.io; …`.
- Update the `connect-src` directive when pointing the client at different orchestrator, pinning, or gateway infrastructure. The helper export `CONNECT_SRC_ORIGINS` in [`config.mjs`](./config.mjs) / [`config.js`](./config.js) enumerates the origins that must be permitted.
- Keep orchestrator, pinning, and gateway hosts aligned between your configuration files and the CSP meta tag before pinning to IPFS to avoid runtime fetch failures.

## Runtime configuration & demo mode

- **Advanced panel overrides**: Click the new **Orchestrator** controls to set the base URL (e.g. `https://alpha.example.com`) and prefix (default `/onebox`). Values are stored in `localStorage` under `AGIJOBS_ONEBOX_ORCHESTRATOR_BASE` / `_PREFIX`.
- **URL parameters**: Append `?orchestrator=https://alpha.example.com&oneboxPrefix=/onebox` to the page URL to preconfigure the client. Use `?orchestrator=demo` to clear overrides and return to demo mode.
- **Demo mode**: When no orchestrator is configured the planner/executor simulate responses locally. The chat will display warnings (no blockchain calls are made) until a live endpoint is supplied. Status polling is disabled in this mode.

## Orchestrator contract configuration

The orchestrator is expected to encapsulate the v2 contract ABIs and addresses and to expose two HTTPS endpoints:

- `POST /onebox/plan`: accepts `{ text, message, history }` and returns a validated ICS object or a higher-level JobIntent (see `/docs` in the orchestrator).
- `POST /onebox/execute`: accepts `{ ics, aa }` (legacy ICS flow) or `{ intent, mode }` (JobIntent flow) and either streams Server-Sent Events or returns a JSON receipt.
- `GET /onebox/status`: returns a JSON array summarising recent jobs for the status board.

The client enforces the intent allowlist defined in [`lib.mjs`](./lib.mjs). Owner-only operations must be blocked server-side unless the orchestrator verifies the caller is authorised.

## Account Abstraction & relayer notes

- `AA_MODE.enabled = true` enables the ERC-4337 path. The orchestrator should construct sponsored `UserOperation`s via an Account Abstraction SDK such as [Alchemy’s aa-sdk](https://github.com/alchemyplatform/aa-sdk).
- If AA is unavailable, set `AA_MODE.enabled = false` and let the orchestrator use an alternative relayer (e.g. OpenZeppelin Defender). Receipts should still stream through `/onebox/execute`.
- `STATUS_URL` enables the job status board and should point to `/onebox/status`.
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
2. Run `npm run onebox:static:build` to refresh the hashed bundle in `apps/onebox-static/dist`.
3. Upload the contents of `apps/onebox-static/dist` to IPFS (web3.storage, Pinata, or similar).
4. Optionally configure DNSLink for a custom domain pointing to the CID.
5. Monitor orchestrator logs and paymaster balances; rotate tokens regularly.

## Resetting local state

Use the browser console to clear cached settings:

```js
localStorage.removeItem("W3S_TOKEN");
```

This forces the token prompt to reappear on the next upload attempt.
