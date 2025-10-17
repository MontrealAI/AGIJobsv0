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
- Mints three disruption insights, reveals the first FusionPlan, lists two tokens, and executes a sale.
- Resolves the traded prediction and exports integrity artefacts.

Watch the console for emoji-tagged telemetry such as:

```
🤖 [Meta-Sentinel] Initialising α-AGI Insight MARK deployment lattice.
🤖 [Thermodynamic Oracle] Evaluating Finance rupture – confidence 91.0%.
```

## 3. Post-run Artefacts

Navigate to `demo/alpha-agi-insight-mark/reports/` and review:

- `insight-report.md` – executive summary (ready to paste into investor decks).
- `insight-control-matrix.json` – machine-readable owner control inventory.
- `insight-control-map.mmd` – mermaid diagram (render via https://mermaid.live/).
- `insight-manifest.json` – SHA-256 hashes; re-run the demo and confirm hashes change only when artefacts change.
- `insight-telemetry.log` – chronological agent conversation for audit trails.

## 4. Owner Control Drills

1. **Pause/Resume** – From the Hardhat console or Owner Console UI, call `pause()` on each contract to halt trading, then `unpause()`.
2. **Rotate Oracle** – Use `setOracle(<new address>)` on the exchange. The new oracle can immediately call `resolvePrediction`.
3. **Retarget Treasury** – Call `setTreasury(<new address>)`. Validate the change via `insight-recap.json` and on-chain logs.
4. **Reveal FusionPlan** – Trigger `revealFusionPlan(tokenId, uri)` to expose the cryptosealed FusionPlan at your chosen time.

## 5. Verification Loop

1. Run `npm run test:alpha-agi-insight-mark` to execute unit tests.
2. Run `npm run demo:alpha-agi-insight-mark:ci` to recreate the artefacts in dry-run mode.
3. Compare the new `insight-manifest.json` to the previous run to ensure reproducibility.
4. Store artefacts in your evidence vault alongside transaction hashes for board reviews.

## 6. Live Network Launch (Advanced)

1. Export the required environment variables (RPC URL, private keys).
2. Set `AGIJOBS_DEMO_DRY_RUN=false` so the script prompts for `launch` confirmation.
3. After deployment, import contract addresses from `insight-recap.json` into the Owner Console to manage pause/upgrade levers.

> **Emergency** – Invoke `pause()` on the exchange first (halts trading), then `pause()` on the Nova-Seed and settlement token. Use the owner change ticket from `docs/owner-control-briefing.md` for the incident log.

## 7. Clean-up

Hardhat resets automatically. If targeting a persistent network, retain the generated artefacts, note the contract addresses, and update your governance records.
