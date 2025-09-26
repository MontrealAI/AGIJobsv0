# AGI Jobs One-Box UI

A static, IPFS-friendly front-end that wraps the AGI Jobs v2 workflow behind a single natural-language input. It calls the AGI-Alpha Orchestrator meta-agent (`/onebox/*`) to translate human requests into actionable job intents and execute them via the relayer (guest mode) or wallet signing (expert mode).

## Features

- **Single text box UX**: type what you need, receive a plan, confirm, execute.
- **Walletless by default**: guest mode uses the orchestrator relayer; expert mode exposes wallet signing flows.
- **Status board**: lightweight polling of `/onebox/status` for recent jobs.
- **Demo mode**: if no orchestrator URL is configured, the UI simulates responses for offline demos.
- **Persistent settings**: orchestrator URL, API token, and status refresh cadence are stored in `localStorage`.
- **Humanised errors**: maps common on-chain failures to plain-language hints.

## Getting started

1. Serve the folder locally (any static web server works). Example using `http-server`:
   ```sh
   npx http-server apps/onebox -p 4173 -c-1
   ```
2. Open the page in your browser and open the **Settings** dialog.
3. Set the Orchestrator URL (e.g. `https://alpha-agent.example`) and optional API token.
4. Submit a request such as “Post a labeling job for 500 images; pay 5 AGIALPHA; 7 days.”
5. Confirm the plan and watch the execution receipt. Recent jobs appear in the status board.

### Hosting on IPFS

```sh
ipfs add -r apps/onebox
```
Take the returned CID and publish through your preferred gateway or ENS content hash. No environment secrets are embedded in the client.

## Accessibility & UX

- Form controls include labels and keyboard focus states.
- The chat log is marked `aria-live="polite"` to announce updates.
- Confirmation prompts expose explicit buttons for yes/no decisions.

## Development notes

- `app.js` is written as an ES module without build tooling to keep the site hostable on IPFS.
- Update the error dictionary in `app.js` if the orchestrator introduces new error codes/messages.
- When `/onebox/status` gains pagination, extend `renderStatuses` to handle `nextToken` / paging metadata.

## Directory structure

```
apps/onebox/
├── app.js       # UI logic, planner/executor calls, demo mode
├── index.html   # Markup and settings modal
├── README.md    # This file
└── styles.css   # Visual design tokens and layout
```
