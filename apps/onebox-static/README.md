# AGI Jobs One-Box (Static)

This folder hosts an unbundled, standards-based web application that can be pinned to IPFS and loaded directly from any compatible gateway. The UI exposes a single-input chat box that relays natural-language requests to the AGI-Alpha orchestrator, validates the returned Intent-Constraint Schema (ICS), and executes supported intents through the sponsored Account Abstraction or relayer bridge.

## Development quick start

1. Serve the directory with any static web server (for example `npx serve apps/onebox-static`).
2. Edit `config.js` with the orchestrator, executor, and IPFS endpoints for your environment.
3. Paste a [web3.storage](https://web3.storage) API token into local storage under the key `W3S_TOKEN` (the UI prompts for it on demand when pinning attachments).
4. Drop or paste files into the page before submitting a request to include them as attachments in the next interaction.

## Deploying to IPFS

1. Update `config.js` with production endpoints.
2. Upload the folder to your preferred IPFS pinning service (e.g. `web3.storage`, `nft.storage`).
3. Share the resulting CID, or wire it to DNSLink for a custom domain.

## Testing checklist

- Planner requests time out after 25 seconds and surface friendly errors.
- ICS validation enforces the supported intent allow list and 140-character confirmation summaries.
- Attachments dropped or pasted into the page are pinned to IPFS before execution.
- Confirmations require an explicit `YES` before value-moving intents proceed.
