# Mission Review Checklist

Use this checklist after every theatre run to confirm the artefacts are intact, governance controls are verified, and CI hygiene remains green. Each step cites the relevant command or artefact for cross-verification.

## 1. Artefact integrity

- [ ] **Run manifest integrity check** (already executed by the demo). Review `reports/agi-os/first-class/first-class-run.json` → `steps[]` for `integrity-check` status `success`.
- [ ] **Spot-check hashes** by recomputing SHA-256 for a random file:
  ```bash
  sha256sum reports/agi-os/grand-summary.md
  ```
  Confirm the hash matches the corresponding entry in `first-class/first-class-manifest.json`.
- [ ] **Open executive summary** via `reports/agi-os/grand-summary.html` and confirm mission objective, budget, dry-run outcomes, and owner control matrix render correctly.
- [ ] **Inspect Mermaid control map** by running:
  ```bash
  npx @mermaid-js/mermaid-cli -i reports/agi-os/first-class/owner-control-map.mmd -o /tmp/owner-control-map.svg
  ```
  (Optional) Review the SVG to ensure ownership hierarchy is correct.

## 2. Owner authority verification

- [ ] Confirm `owner-control-matrix.json` lists every module with `status: "ready"` except known configuration gaps (⚠️ entries should have associated follow-up tickets).
- [ ] Execute a dry governance action:
  ```bash
  npm run owner:dashboard -- --dry-run
  ```
  Ensure the output matches the owner/pauser addresses from the summary.
- [ ] If the system was unpaused for interactive testing, re-run:
  ```bash
  npm run owner:command-center -- pause-all
  ```
  Verify in the Owner Console UI that the pause state updates instantly.

## 3. Simulation telemetry

- [ ] Review `reports/agi-os/mission-bundle/manifest.json` to confirm the ASI take-off telemetry, thermodynamics, and dry-run logs are present.
- [ ] Tail the deterministic labour market log:
  ```bash
  less +G reports/agi-os/mission-bundle/dry-run.log
  ```
  Check for `✅` or `COMPLETED` markers on every mission stage.

## 4. CI & automation hygiene

- [ ] Run lint and static checks locally (mirrors CI v2 surface):
  ```bash
  npm run lint:ci
  npm run check:coverage
  npm run check:access-control
  ```
  (Optional) execute `npm test` or targeted suites as required.
- [ ] Verify branch protection expectations:
  ```bash
  npm run ci:verify-branch-protection
  ```
  Confirm the script reports required checks for main and PR branches.
- [ ] Capture the `reports/agi-os/first-class/first-class-run.json` file along with CI run URLs for audit storage.

## 5. Archive & communication

- [ ] Package artefacts for stakeholders:
  ```bash
  tar -czf astral-omnidominion-mission-bundle.tar.gz reports/agi-os
  ```
- [ ] Share `grand-summary.html` and the generated manifest with decision-makers.
- [ ] Log outcomes, including any ⚠️ items, in the Owner Control ticketing system or change log.

Complete all boxes before certifying the demonstration as **green**.
