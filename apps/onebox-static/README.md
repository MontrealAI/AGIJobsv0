# AGI Jobs One‑Box (Static)

A single-textbox, IPFS-hostable client that speaks to the AGI‑Alpha Meta-Agent to plan intents for AGI Jobs v2 and executes them gaslessly via account abstraction or a relayer. The UI is framework-free (pure HTML/CSS/ES modules) so it can be uploaded directly to IPFS without a build step.

## Features

- **Planner integration** – Sends the ongoing conversation to the AGI‑Alpha orchestrator `/plan` endpoint and validates the returned Intent-Constraint Schema (ICS) locally before execution.
- **Gasless execution** – Delegates to the orchestrator `/execute` endpoint which is expected to drive an ERC‑4337 AA path with a sponsored paymaster, falling back to a relayer when AA is unavailable.
- **ENS-aware UX** – Exposes confirmations and receipts in human language; advanced metadata (transaction hash, block, gateway links) is surfaced behind a toggle and rendered as structured key/value rows so the blockchain stays hidden by default.
- **IPFS support** – Users can attach job specs or submissions that are pinned client-side via web3.storage before execution so contracts only reference immutable IPFS URIs.
- **No build tooling** – Drop the folder into any static host or pin it to IPFS; configuration lives in `config.mjs`.

## Getting started

1. Ensure the AGI‑Alpha orchestrator façade is reachable (see `config.mjs` for the expected `/plan` and `/execute` endpoints) with CORS enabled for the origin that will serve this UI.
2. Edit `config.mjs` if needed to point at your orchestrator, chain, or bundler configuration.
3. (Optional) Update the fallback IPFS gateways list if you have preferred gateways for receipts.
4. Pin the `apps/onebox-static/` directory to IPFS (e.g. using [`web3.storage`](https://docs-beta.web3.storage/getting-started/w3up-client/)).
5. Share the gateway URL. The UI will prompt for natural language instructions, obtain the ICS plan, show confirmation prompts when value moves, and then surface human-readable receipts.

## Runtime expectations

- `PLAN_URL` and `EXEC_URL` must be HTTPS endpoints exposed by the AGI‑Alpha orchestrator integration described in the sprint plan.
- `/execute` should respond with Server-Sent Events (`data: {json}\n\n`) reporting status, confirmation, receipt, and error events. The UI will display status updates inline and stream advanced metadata into the Advanced panel.
- The orchestrator must enforce contract/function allowlists, spend caps, simulation-before-send and other safeguards; the UI assumes those server-side protections exist and does not include privileged keys.

## IPFS uploads via web3.storage

The UI expects a `web3.storage` token to be stored in `localStorage` for the current browser origin. Use the **Advanced** toggle to paste or clear this token. Uploaded JSON and files will return:

- `cid`: the raw CID
- `cidLink`: `ipfs://` URI
- `gateways`: array of HTTP gateway URLs derived from `config.js`

After a successful pin the chat feed posts a summary bubble listing each CID so the operator gets immediate confirmation. The
Advanced panel simultaneously refreshes with clickable gateway links for every pinned attachment and generated JSON payload, ma
king it easy to open the content from any configured gateway without waiting for downstream receipts.

These values are inserted into the ICS payload before execution when `create_job` requests are missing a `uri` field and the user supplied text or attachments.

## Customising confirmations

When `ics.confirm` is `true`, the UI requires a positive confirmation (`YES`) before continuing. Summaries longer than 140 characters are truncated client-side to keep confirmations concise per the product requirements.

## Development notes

This app intentionally avoids bundlers. If you need local linting or testing you can point your preferred tooling at this directory, but no build artifacts are produced. Any changes should remain compatible with evergreen browsers supporting ES modules, async/await, Fetch streaming, and the File API.

