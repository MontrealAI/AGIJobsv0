# AGI Jobs One-Box UI

A static, IPFS-friendly front-end that wraps the AGI Jobs workflow behind a single natural-language input. It calls the AGI-Alpha orchestrator (`/onebox/*`) to translate human requests into actionable job intents and execute them via the relayer (guest mode) or wallet signing (expert mode).

The build now fingerprints assets, injects Subresource Integrity (SRI) hashes, and emits a hardened Content Security Policy (CSP) so releases can be safely pinned to IPFS and surfaced through ENS gateways.

## Features

- **Single text box UX**: type what you need, receive a plan, confirm, execute.
- **Walletless by default**: guest mode uses the orchestrator relayer; expert mode exposes wallet signing flows.
- **Expert Mode toggle**: enables EIP-1193 wallets (MetaMask, Rabby, etc.) for self-signing.
- **Local persistence**: orchestrator URL and API token are stored in `localStorage` for quick reconnects.
- **Humanised errors**: maps common on-chain failures to plain-language hints.
- **Pure static assets**: ships as `index.html` + `app.js` without build tooling so it can be pinned straight to IPFS.

## Getting started

1. Build the static bundle (fingerprinted assets land in `apps/onebox/dist`):
   ```sh
   npm run onebox:build
   ```
2. Serve the `dist/` directory locally (any static web server works). Example using Python:
   ```sh
   cd apps/onebox/dist
   python -m http.server 4173
   ```
3. Open the page in your browser and fill out the **Advanced** section with your orchestrator URL and optional API token.
4. Submit a request such as “Post a labeling job for 500 images; pay 5 AGIALPHA; 7 days.”
5. Confirm the plan and watch for the on-chain receipt link.

### Hosting on IPFS & ENS

Use the automated publisher to package the build into a CAR file, upload to web3.storage, pin with Pinata, probe gateway health, and (optionally) update an ENS contenthash:

```sh
npm run onebox:publish
```

Environment variables control optional steps:

| Purpose | Variables |
| --- | --- |
| web3.storage upload | `WEB3_STORAGE_TOKEN` or `W3S_TOKEN` |
| Pinata pin | `PINATA_JWT` (or `PINATA_API_KEY` + `PINATA_SECRET_API_KEY`) |
| ENS contenthash | `ENS_NAME`, `ENS_PRIVATE_KEY`, `ENS_RPC_URL` *(and optionally `ENS_RESOLVER`/`ENS_REGISTRY`)* |

Add `--dry-run` to inspect the flow without writing anything on-chain or uploading to the pinning services.

## Accessibility & UX

- Form controls include labels and keyboard focus states.
- The chat log is marked `aria-live="polite"` to announce updates.
- Confirmation prompts expose explicit buttons for yes/no decisions.

## Directory structure

```
apps/onebox/
├── app.js          # UI logic, planner/executor calls
├── config.mjs      # CSP connect-src allow list & gateway probes
├── dist/           # Build artefacts (fingerprinted assets + release metadata)
├── index.html      # Build template (placeholders resolved by scripts/build.mjs)
├── README.md       # This file
├── scripts/        # Build, integrity verification, and publish workflows
└── styles.css      # Theme tokens (extracted from the original inline styles)
```
