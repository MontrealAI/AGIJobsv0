# Operations Playbook – Transcendent Omniversal Demo

This playbook expands the quickstart into a disciplined operations checklist. Follow every section in order; each item references commands and artefacts that already exist inside the repository.

## Phase 0 – Environment Sanity

1. Verify Docker is reachable:
   ```bash
   docker compose version
   ```
2. Confirm repository prerequisites are installed locally (if running outside Docker):
   ```bash
   node --version
   npm --version
   ```
   Node 18+ and npm 9+ are recommended; the `.nvmrc` file pins 20.18.1 for CI parity.

## Phase 1 – Launch Stack & Run Demo

1. Start the one-click stack on a local Anvil chain:
   ```bash
   npm run deploy:oneclick:auto -- --network localhost --compose
   ```
   The command mirrors the documented one-click bootstrap, deploying contracts, enabling the orchestrator, and starting the UI containers.
2. Execute the first-class OS pipeline:
   ```bash
   npm run demo:agi-os:first-class
   ```
   The script emits emoji-prefixed status lines and writes comprehensive telemetry into `reports/agi-os/first-class/`.

## Phase 2 – Artefact Verification

1. Inspect the executive summary:
   ```bash
   less reports/agi-os/grand-summary.md
   ```
   Confirm the Mission Profile, Simulation Recap, and Owner Control Matrix sections render without missing data.
2. Validate the manifest hash list:
   ```bash
   jq '.artifacts[]' reports/agi-os/first-class/first-class-manifest.json
   ```
   Then recompute one sample hash:
   ```bash
   shasum -a 256 reports/agi-os/grand-summary.md
   ```
   Ensure the digest matches the manifest entry.
3. Load the browser-ready briefing by pointing your browser to `reports/agi-os/grand-summary.html`.
4. Render the Mermaid governance map (optional):
   ```bash
   npx @mermaid-js/mermaid-cli -i reports/agi-os/first-class/owner-control-map.mmd -o reports/agi-os/first-class/owner-control-map.svg
   ```
   The CLI is already a development dependency; this command converts the Mermaid file into a shareable SVG.
5. Review the ASI take-off dry run report:
   ```bash
   jq '.scenarios[] | {id, status, summary}' reports/asi-takeoff/dry-run.json
   ```
   Each scenario should show `status: "passed"` for a clean rehearsal.

## Phase 3 – Owner Control Exercises

1. Use the Hardhat command centre to pause every module:
   ```bash
   npm run owner:command-center -- --action pause-all --network localhost
   ```
   The command relies on the generated owner keys inside the one-click environment.
2. Unpause to resume normal operation:
   ```bash
   npm run owner:command-center -- --action unpause-all --network localhost
   ```
3. Generate the owner control diagram again to capture the post-action state:
   ```bash
   npm run owner:diagram -- --network localhost
   ```
   The command regenerates `reports/owner/owner-control-map.mmd`, demonstrating full owner authority remains intact.
4. Cross-check the matrix via the CLI:
   ```bash
   npm run owner:surface -- --network localhost
   ```
   Compare the console output with `reports/agi-os/owner-control-matrix.json`; every module should have `status: ready` unless you deliberately removed a config file.

## Phase 4 – UI Walkthrough

1. Owner Console (http://localhost:3000):
   - Connect to the injected wallet (Anvil default key) or import the governance private key supplied in `deployment-config/generated/`.
   - Review the pause toggles and recent governance receipts.
2. Enterprise Portal (http://localhost:3001):
   - Complete the conversational job form using dummy data.
   - Press **Submit job** and confirm the transaction hash is displayed.
3. Validator Dashboard (http://localhost:3002):
   - Observe the job you just submitted appearing in the review queue.

## Phase 5 – Preservation & Sharing

1. Package the entire mission bundle:
   ```bash
   tar -czf transcendent-omniversal-bundle.tgz reports/agi-os
   ```
2. Store the SHA-256 of the archive for future verification:
   ```bash
   shasum -a 256 transcendent-omniversal-bundle.tgz
   ```
3. Optionally upload `owner-control-map.svg` and `grand-summary.html` to your preferred document portal for executive circulation.

Completing all five phases demonstrates operational mastery, owner supremacy, and evidentiary rigour using nothing more than the repository's built-in capabilities.
