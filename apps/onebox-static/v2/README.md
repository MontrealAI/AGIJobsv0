# AGI Jobs One-Box UI

A static, IPFS-friendly single-input interface for AGI Jobs v2. The page works in a demo mode out of the box and can be wired to the AGI-Alpha Orchestrator when the `/onebox/*` routes are deployed.

## Features

- Single request box with conversational confirmations and planner warnings.
- Walletless default flow with optional Expert Mode toggle.
- Live status board that polls `/onebox/status` and a friendly error dictionary for common failures.
- Accessible keyboard shortcuts and suggestion pills for quick prompts.
- Zero build tooling — deploy the folder to any static host or IPFS pinner.

## Usage

1. Open `index.html` locally or via static hosting.
2. Configure the orchestrator endpoint in the browser console:
   ```js
   localStorage.ORCH_URL = "https://your-orchestrator.example";
   ```
   You can also run `oneboxSetOrchestrator("https://your-orchestrator.example")` for a helper that saves the URL and reloads the page.
3. Send a natural-language instruction such as "Post a labeling job for 500 images; pay 5 AGIALPHA; 7 days".
4. Confirm the plan and wait for the orchestrator to execute.
5. Monitor the recent activity panel at the bottom of the page or press **Refresh** to force a status update on demand.

When no orchestrator URL is configured the UI remains interactive using built-in demo responses, making it safe to embed in documentation or marketing materials before backend integration is ready.
