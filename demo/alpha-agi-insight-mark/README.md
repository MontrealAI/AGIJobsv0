# α-AGI Insight MARK Demo

α-AGI Insight MARK packages the foresight engine, Nova-Seed NFTs, and on-chain marketplace into a single command that any non-technical operator can execute. The demo showcases how AGI Jobs v0 (v2) empowers a team to mint cryptosealed predictions, reveal FusionPlans under owner control, and trade them through a fully-governed exchange where every lever is pauseable, updatable, and auditable.

## Highlights

- **Push-button foresight** – `npm run demo:alpha-agi-insight-mark` deploys the Nova-Seed NFT, Insight Access Token, and Insight Exchange, executes the simulated meta-agent swarm, and exports recap dossiers, telemetry logs, mermaid diagrams, and owner control matrices.
- **Absolute owner command** – The contract owner can pause every module, rotate the oracle, retarget the treasury, retune trading fees, and update or reveal FusionPlans at any time.
- **Instant custody recovery** – A dedicated `reclaimInsight` control lets the owner retake any Nova-Seed from the field and reroute it to a secure wallet in a single transaction.
- **Sentinel-grade emergency controls** – Owners can delegate a cross-contract SystemPause sentinel that can freeze the Nova-Seed, exchange, and settlement token instantly while the owner retains sole authority to resume operations.
- **Tokenised disruption** – Each α-AGI Nova-Seed is minted from the meta-agent scenarios, sealed until the owner reveals it, and can be listed or traded through α-AGI MARK with automated manifest hashing for integrity proofs.
- **Production rigor** – The Hardhat project includes unit tests covering minting, pausing, delegated minters, fixed-price trading, fee distribution, and oracle resolution. The GitHub workflow executes the tests, runs the demo end-to-end, and verifies the generated dossiers.
- **Ledger-synchronised dossiers** – The recap `stats` block, operational metrics, CSV ledger, and owner brief are cross-checked by the verifier so any mismatch between reports and on-chain state is caught automatically.
- **Regulatory superpowers** – Live repricing (`updateListingPrice`) and instant custody evacuation (`forceDelist`) ensure the owner can reshape liquidity or quarantine an asset mid-flight without downtime.
- **Superintelligent foresight instrumentation** – The demo now surfaces composite AGI capability gauges, thermodynamic confidence bands, and a dedicated Meta-Agentic Tree Search mermaid constellation so operators can prove the machine is operating at post-human clarity.

## Quickstart

```bash
npm run demo:alpha-agi-insight-mark
```

The script:

1. Boots a Hardhat in-memory chain (unless custom RPC details are provided).
2. Deploys the Insight Access Token (settlement token), Alpha Insight Nova-Seed, and Alpha Insight Exchange.
3. Simulates the meta-agent pipeline, forging three Nova-Seeds with disruption forecasts.
4. Lists the first two seeds on α-AGI MARK, reprices them live, processes a trade, force-delists the second to sentinel custody, resolves a prediction, drills the delegated sentinel pause/unpause flow, and logs telemetry.
5. Generates Markdown/JSON dossiers under `demo/alpha-agi-insight-mark/reports/` with SHA-256 manifests for audit trails.

### Integrity Verification

```bash
npm run verify:alpha-agi-insight-mark
```

The verifier replays every CI dossier check locally: it validates the manifest fingerprints, ensures recap/telemetry payloads
exist, confirms the executive HTML dashboard and Markdown brief include all superintelligence sections, and asserts that the
owner control matrix and mermaid schematics enumerate the sentinel, oracle and exchange surfaces. Non-technical operators get a
single ✅/❌ gate before sharing artefacts with stakeholders.

Set `AGIJOBS_DEMO_DRY_RUN=false` to enable the explicit launch confirmation prompt before broadcasting to a live network. Custom networks can be targeted via:

- `INSIGHT_MARK_NETWORK`
- `INSIGHT_MARK_RPC_URL`
- `INSIGHT_MARK_CHAIN_ID`
- `INSIGHT_MARK_OWNER_KEY`
- `INSIGHT_MARK_PARTICIPANT_KEYS`
- `INSIGHT_MARK_ORACLE_KEYS`
- `INSIGHT_MARK_SCENARIO_FILE`
- `INSIGHT_MARK_EXPECTED_OWNER`

When a custom scenario file is supplied via `INSIGHT_MARK_SCENARIO_FILE`, the demo validates the JSON exists, records its SHA-256 fingerprint, and embeds both the path and hash in the recap/manifest so operators can prove the data provenance. `INSIGHT_MARK_EXPECTED_OWNER` and `INSIGHT_MARK_CHAIN_ID` are enforced against the live Hardhat signer and connected network to prevent misconfigured mainnet deployments.

## Tests

```bash
npm run test:alpha-agi-insight-mark
```

The suite covers:

- Owner and delegated minter flows, metadata updates, and fusion-plan reveals and revisions.
- Pause guards on the NFT contract including delegated sentinel authority.
- Fixed-price listing, purchase execution, fee routing, and cancellation.
- Oracle resolution governance on the exchange plus sentinel-driven pause drills.
- Settlement token sentinel controls.

## Reports & Dossiers

Running the demo produces:

- `insight-recap.json` – network, contract addresses, minted seed states, telemetry, and a `stats` block validating counts,
  confidence bands, capability index, and forecast mass against the ledger.
- `insight-report.md` – executive summary with tables, an operational metrics section, and owner command hooks.
- `insight-report.html` – shareable executive dashboard with disruption timeline visualisation and live operational metrics cards.
- `insight-control-matrix.json` – machine-readable owner control registry.
- `insight-control-map.mmd` – mermaid diagram for governance briefings.
- `insight-governance.mmd` – meta-agent swarm and sentinel orchestration schematic.
- `insight-superintelligence.mmd` – Meta-Agentic Tree Search + thermodynamic trigger mermaid capturing the superintelligent foresight engine.
- `insight-telemetry.log` – time-stamped agent dialogue.
- `insight-owner-brief.md` – rapid-response owner command checklist with custody overview.
- `insight-market-matrix.csv` – CSV dataset for financial modelling and downstream analytics.
- `insight-constellation.mmd` – mermaid constellation showing live custody, market, and sentinel linkages.
- `insight-manifest.json` – SHA-256 hashes of every generated artefact and the scenario dataset that produced them.

All outputs are designed for direct inclusion in boardroom briefings and investor packets.

## Runbook & Governance Dossiers

- [`runbooks/operator-runbook.md`](runbooks/operator-runbook.md) – step-by-step operator walkthrough.
- [`docs/owner-control-briefing.md`](docs/owner-control-briefing.md) – governance levers, emergency response, and verification checklist.

## Integration with AGI Jobs v0 (v2)

The demo is additive and does not modify existing protocol modules. It relies exclusively on the toolchain shipped with AGI Jobs v0 (v2) and is covered by a dedicated GitHub Actions workflow that enforces unit tests, the demo run, and dossier verification on pull requests targeting this directory.

The orchestration demonstrates a superintelligent economic oracle under full owner command: capability gauges quantify disruption certainty, thermodynamic triggers broadcast rupture timing, and every parameter can still be paused, re-keyed, or repriced instantly from the owner console.
