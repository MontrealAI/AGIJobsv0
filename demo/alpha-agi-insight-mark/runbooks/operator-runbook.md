# α-AGI Insight MARK – Operator Runbook

This runbook assumes zero Solidity or DevOps experience. Follow the steps to launch, audit, and govern the foresight marketplace from a single terminal.

## 1. Pre-flight Checklist

1. Install Node.js 20.18 (matching `.nvmrc`).
2. Clone the AGI Jobs v0 (v2) repository and run `npm ci` at the root once.
3. Ensure Docker is not required – the demo uses Hardhat’s in-memory chain by default.

## 2. Launch Sequence

```bash
npm run demo:alpha-agi-insight-mark
```

The orchestrator:

- Deploys the Insight Access Token, Nova-Seed NFT, and Foresight Exchange.
- Spins up the synthetic meta-agent swarm (Meta-Sentinel, Thermodynamic Oracle, FusionSmith, Venture Cartographer, Guardian Auditor).
- Mints three disruption insights, reveals and revises the first FusionPlan, lists two tokens, reprices live, executes a sale, force-delists a listing to sentinel custody, and renders capability gauges for the superintelligent foresight engine.
- Resolves the traded prediction, drills the delegated SystemPause sentinel, and exports integrity artefacts.

Watch the console for emoji-tagged telemetry such as:

```
🤖 [Meta-Sentinel] Initialising α-AGI Insight MARK deployment lattice.
🤖 [Thermodynamic Oracle] Evaluating Finance rupture – confidence 91.0%.
```

## 3. Post-run Artefacts

Navigate to `demo/alpha-agi-insight-mark/reports/` and review:

- `insight-report.md` – executive summary (ready to paste into investor decks) with operational command metrics covering minted, market, and confidence posture.
- `insight-report.html` – polished executive dashboard with timeline, confidence bars, and live operational metrics cards for board briefings.
- `insight-control-matrix.json` – machine-readable owner control inventory.
- `insight-control-map.mmd` – mermaid diagram (render via https://mermaid.live/).
- `insight-governance.mmd` – insight swarm + sentinel orchestration schematic.
- `insight-superintelligence.mmd` – Meta-Agentic Tree Search + thermodynamic trigger constellation (render via https://mermaid.live/).
- `insight-owner-brief.md` – executive command sheet summarising pause hooks and custody.
- `insight-safety-checklist.md` – safety and control checklist showing contract owners, sentinels, override levers, and integrity assertions.
- `insight-market-matrix.csv` – spreadsheet-ready dataset showing confidence basis points, forecast magnitude, custody and market state for each Nova-Seed.
- `insight-constellation.mmd` – constellation mermaid capturing live custody and sentinel edges.
- `insight-agency-orbit.mmd` – orbit schematic linking each meta-agent to its minted seeds and custody paths.
- `insight-lifecycle.mmd` – sequence diagram evidencing owner command authority across the full deployment-to-market cycle.
- `insight-manifest.json` – SHA-256 hashes; re-run the demo and confirm hashes change only when artefacts change. The manifest now fingerprints the scenario dataset too, so provenance can be attested.
- `insight-ledger.json` – structured ledger of every mint/list/reprice/sale hash plus sentinel pause + owner resume drill receipts.
- `insight-recap.json` – network metadata, contract addresses, minted ledger, telemetry, and a stats block validating owner/delegate mints, market state, confidence bands, capability index, and forecast value against generated artefacts.
- `insight-telemetry.log` – chronological agent conversation for audit trails.

## 4. Owner Control Drills

1. **Delegate Sentinel** – Call `setSystemPause(<sentinel address>)` on all three contracts, then have the sentinel trigger `pause()`. Only the owner can `unpause()`.
2. **Pause/Resume** – From the Hardhat console or Owner Console UI, call `pause()` on each contract to halt trading, then `unpause()`.
3. **Rotate Oracle** – Use `setOracle(<new address>)` on the exchange. The new oracle can immediately call `resolvePrediction`.
4. **Retarget Treasury** – Call `setTreasury(<new address>)`. Validate the change via `insight-recap.json` and on-chain logs.
5. **Dynamic Pricing** – Reprice an active listing via `updateListingPrice(tokenId, price)`; confirm the markdown reflects the new amount.
6. **Custody Override** – Call `forceDelist(tokenId, <custodian>)` to evacuate a seed into a safe wallet, then re-list when cleared.
7. **Reveal & Revise FusionPlan** – Trigger `revealFusionPlan(tokenId, uri)` to expose the cryptosealed FusionPlan, then `updateFusionPlan(tokenId, uri)` if revisions are needed.
8. **Retune Forecast Parameters** – Use `updateInsightDetails(tokenId, sector, thesis, timestamp, confidenceBps, forecastValue)` to refresh disruption metadata and economic magnitude under owner command.

## 5. Verification Loop

1. Run `npm run test:alpha-agi-insight-mark` to execute unit tests.
2. Run `npm run demo:alpha-agi-insight-mark:ci` to recreate the artefacts on a fresh, unforked in-process Hardhat chain. This performs local simulated transactions; it is not a read-only external-network mode.
3. Execute `npm run verify:alpha-agi-insight-mark` – the verifier performs the same manifest, telemetry, and mermaid integrity checks enforced in CI so non-technical operators can certify the dossier bundle locally.
4. Compare the new `insight-manifest.json` to the previous run to ensure reproducibility.
5. Store artefacts in your evidence vault alongside transaction hashes for board reviews.
6. Audit GitHub branch protections. Run `read -s GITHUB_TOKEN && export GITHUB_TOKEN` before `npm run ci:verify-branch-protection -- --branch main` so the token is never echoed into logs, then archive the ✅/❌ transcript. Finish with `unset GITHUB_TOKEN`.

## 6. Live Network Launch (Advanced)

1. Export the required environment variables (RPC URL, private keys).
2. Optionally set `INSIGHT_MARK_SCENARIO_FILE` to your curated foresight dataset – the script will refuse to run if the file is missing and will embed the SHA-256 fingerprint in every recap.
3. Use an explicitly configured non-reserved external network with verified chain ID and distinct actor accounts. Set `AGIJOBS_DEMO_DRY_RUN=false` so the script prompts for `launch` confirmation. Confirm the prompt by typing `LAUNCH`.
4. (Recommended) Set `INSIGHT_MARK_CHAIN_ID` and `INSIGHT_MARK_EXPECTED_OWNER` to enforce that the connected network and signer match your deployment plan.
5. After deployment, import contract addresses from `insight-recap.json` into the Owner Console to manage pause/upgrade levers.

> **Emergency** – Have the delegated sentinel issue `pause()` on all contracts, then coordinate owner-led `unpause()` once investigations complete. Record the action using the owner change ticket from `docs/owner-control-briefing.md`.

## 7. Clean-up

Hardhat resets automatically. If targeting a persistent network, retain the generated artefacts, note the contract addresses, and update your governance records.
