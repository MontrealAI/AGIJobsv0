# AGI Jobs One-Box (Static)

This directory hosts a standalone, standards-based HTML/JS bundle that can be pinned to IPFS and served from any public gateway.

## Files

- `index.html` – single-page chat surface optimised for mobile and desktop.
- `app.mjs` – client logic for planner/executor orchestration, confirmations, receipts, and local IPFS pinning.
- `config.mjs` – endpoints and AA configuration that operators customise per deployment.
- `lib.js` – lightweight helpers for ICS validation, token math, and IPFS pinning.

## Local preview

Open `index.html` in any modern browser or run a simple static file server, e.g.:

```bash
npx serve .
```

## Deploying to IPFS

1. Generate a Web3.Storage API token and store it in the browser via the Advanced panel (the token is persisted in `localStorage.AGIJOBS_W3S_TOKEN`).
2. Update `config.mjs` with your orchestrator and executor endpoints.
3. Upload the contents of this folder to IPFS (e.g. using `web3.storage` CLI or dashboard).
4. Share the resulting gateway URL, such as `https://w3s.link/ipfs/<CID>/index.html`.
