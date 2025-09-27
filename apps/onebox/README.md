# AGI Jobs One-Box UI

A static, IPFS-friendly front-end that wraps the AGI Jobs workflow behind a single natural-language input. It calls the AGI-Alpha orchestrator (`/onebox/*`) to translate human requests into actionable job intents and execute them via the relayer (guest mode) or wallet signing (expert mode).

## Features

- **Single text box UX**: type what you need, receive a plan, confirm, execute.
- **Walletless by default**: guest mode uses the orchestrator relayer; expert mode exposes wallet signing flows.
- **Expert Mode toggle**: enables EIP-1193 wallets (MetaMask, Rabby, etc.) for self-signing.
- **Local persistence**: orchestrator URL and API token are stored in `localStorage` for quick reconnects.
- **Humanised errors**: maps common on-chain failures to plain-language hints.
- **Pure static assets**: ships as `index.html` + `app.js` without build tooling so it can be pinned straight to IPFS.

## Getting started

1. Serve the folder locally (any static web server works). Example using Python:
   ```sh
   cd apps/onebox
   python -m http.server 4173
   ```
2. Open the page in your browser and fill out the **Advanced** section with your orchestrator URL and optional API token.
3. Submit a request such as “Post a labeling job for 500 images; pay 5 AGIALPHA; 7 days.”
4. Confirm the plan and watch for the on-chain receipt link.

### Hosting on IPFS

```sh
ipfs add -r apps/onebox
```
Take the returned CID and publish through your preferred gateway or ENS content hash. No environment secrets are embedded in the client.

## Accessibility & UX

- Form controls include labels and keyboard focus states.
- The chat log is marked `aria-live="polite"` to announce updates.
- Confirmation prompts expose explicit buttons for yes/no decisions.

## Directory structure

```
apps/onebox/
├── app.js       # UI logic, planner/executor calls
├── index.html   # Markup, inline styling, advanced settings
├── README.md    # This file
├── styles.css   # Legacy theme tokens (optional)
└── ...          # Next.js scaffold kept for future iterations
```
