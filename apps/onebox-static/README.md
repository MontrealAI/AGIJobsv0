# AGI Jobs One-Box (Static UI)

A single-textbox, gasless, walletless interface for AGI Jobs v2 that runs entirely from static hosting (e.g. IPFS). The page talks to the AGI-Alpha Orchestrator for natural-language planning and streams execution receipts through either an Account Abstraction (ERC-4337) path or a Defender relayer fallback.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Minimal shell (HTML/CSS) for the chat surface, advanced panel, and accessibility hooks. |
| `app.mjs` | Main ES module orchestrating user interactions, planner calls, confirmations, IPFS uploads, and execution streaming. |
| `config.mjs` | Environment-specific endpoints and AA toggle. |
| `lib.mjs` | Shared helpers: ICS validation, event formatting, IPFS utilities. |

## Running locally

1. Serve the directory with any static server (`npx serve apps/onebox-static`).
2. Update `config.mjs` to point at your AGI-Alpha Orchestrator endpoints.
3. In the browser console, set your web3.storage token if you plan to attach files:
   ```js
   localStorage.setItem('AGIJOBS_W3S_TOKEN', '<token>');
   ```
4. Interact via the single input box. Value-moving intents ask for `YES/NO` confirmation, then stream receipts to the conversation.

## Publishing to IPFS

* Zip or upload the folder via [web3.storage](https://web3.storage/).
* Pin the resulting CID and share `https://w3s.link/ipfs/<CID>/index.html`.
* Optionally configure DNSLink for a custom domain.

## Notes

* The UI never stores private keys. Account Abstraction sponsorship configuration lives server-side in the orchestrator or paymaster.
* ENS requirements must be handled in the orchestrator response; the UI surfaces the human-readable guidance via planner messages.
