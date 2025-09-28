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

## Build outputs

- The static bundle is fingerprinted: `esbuild` emits hashed filenames for JavaScript, CSS, and shared chunks while `dist/manifest.json` records the mapping.
- The build step injects Subresource Integrity hashes (SHA-384 and SHA-512) for each hashed asset. Run `npm run verify:sri` to validate the manifest and HTML wiring.
- Content Security Policy directives pull their `connect-src` list from [`CONNECT_SRC_ORIGINS`](./config.mjs). Update orchestrator, pinning, or gateway URLs in `config.mjs` to have them reflected automatically in the CSP meta tag.

## Utility helpers

- [`toWei`](./lib.mjs) converts human-readable AGIALPHA amounts into 18-decimal `BigInt` values for simulations and spend-cap checks.
- [`formatAGIA`](./lib.mjs) renders on-chain balances back into concise human units, trimming trailing decimals by default.

## Testing suggestions

- Use Playwright to drive the static page through the “micro-job” happy path described in the main product spec.
- Mock the orchestrator endpoints locally for unit testing ICS validation and confirmation flows.

## Deployment via IPFS

### Automated release & pinning

Use the publish helper to build, verify, and push the bundle to multiple pinning providers before updating ENS content records:

```bash
WEB3_STORAGE_TOKEN=... \
PINATA_JWT=... \
ENS_NAME=onebox.yourname.eth \
ENS_PRIVATE_KEY=... \
ENS_RPC_URL=https://mainnet.example.com \
npm run onebox:static:publish
```

The script:

1. Executes the static build (`build.mjs`) and integrity audit (`verify-sri.mjs`) unless `--skip-build` is supplied.
2. Packs `dist/` into a deterministic CAR file, calculates the root CID, and uploads the archive to [web3.storage](https://web3.storage) with the provided API token.
3. Asks Pinata to pin the same CID (supports JWT or API key credentials). Optional `PINATA_HOST_NODES` can enumerate multiaddresses to speed replication.
4. Writes `dist/release.json` summarising the CID, CAR path, manifest, pin status, and any ENS updates for later audits.
5. Probes every configured gateway (including the ENS `.limo` URL when set) and stores an availability report aligned with the 99.9% SLO target.
6. Updates the ENS contenthash for `ENS_NAME` so the site resolves via `https://<name>.limo`, unless `--skip-ens` (or `--dry-run`) is used.

Environment variable aliases: `W3S_TOKEN`, `PINATA_JWT_KEY`, `ONEBOX_ENS_NAME`, `ONEBOX_ENS_PRIVATE_KEY`, and `ONEBOX_ENS_RPC_URL` are also recognised.

Release options:

- `--dry-run`: builds and emits the CAR + `release.json` without touching any network services.
- `--skip-web3`, `--skip-pinata`, `--skip-ens`: disable individual publishing steps when debugging.
- `--skip-health`: bypass the post-publish gateway availability probes.
- `ONEBOX_RELEASE_LABEL`: override the default timestamp-based release name (useful for CI tags).

### Manual checklist

1. Confirm accessibility of orchestrator URLs via HTTPS from the target gateway.
2. Run `npm run onebox:static:publish` (or `npm run onebox:static:build` for manual uploads) to refresh the hashed bundle in `apps/onebox-static/dist`.
3. If skipping the automated pin, upload the contents of `apps/onebox-static/dist` (including the CAR and `release.json`) to your pinning providers.
4. Set the ENS contenthash to the release CID. The publish script automates this step when credentials are provided.
5. Monitor orchestrator logs and paymaster balances; rotate tokens regularly.

### Availability SLO

- Target 99.9% availability across two independent IPFS pinning services (e.g., web3.storage + Pinata). Monitor `release.json` outputs and provider dashboards to ensure both replicas remain healthy.

## Resetting local state

Use the browser console to clear cached settings:

```js
localStorage.removeItem("W3S_TOKEN");
```

This forces the token prompt to reappear on the next upload attempt.
