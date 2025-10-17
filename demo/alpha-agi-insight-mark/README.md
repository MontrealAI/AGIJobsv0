# α-AGI Insight MARK Demo

α-AGI Insight MARK packages the foresight engine, Nova-Seed NFTs, and on-chain marketplace into a single command that any non-technical operator can execute. The demo showcases how AGI Jobs v0 (v2) empowers a team to mint cryptosealed predictions, reveal FusionPlans under owner control, and trade them through a fully-governed exchange where every lever is pauseable, updatable, and auditable.

## Highlights

- **Push-button foresight** – `npm run demo:alpha-agi-insight-mark` deploys the Nova-Seed NFT, Insight Access Token, and Insight Exchange, executes the simulated meta-agent swarm, and exports recap dossiers, telemetry logs, mermaid diagrams, and owner control matrices.
- **Absolute owner command** – The contract owner can pause every module, rotate the oracle, retarget the treasury, retune trading fees, and update or reveal FusionPlans at any time.
- **Sentinel-grade emergency controls** – Owners can delegate a cross-contract SystemPause sentinel that can freeze the Nova-Seed, exchange, and settlement token instantly while the owner retains sole authority to resume operations.
- **Tokenised disruption** – Each α-AGI Nova-Seed is minted from the meta-agent scenarios, sealed until the owner reveals it, and can be listed or traded through α-AGI MARK with automated manifest hashing for integrity proofs.
- **Production rigor** – The Hardhat project includes unit tests covering minting, pausing, delegated minters, fixed-price trading, fee distribution, and oracle resolution. The GitHub workflow executes the tests, runs the demo end-to-end, and verifies the generated dossiers.

## Quickstart

```bash
npm run demo:alpha-agi-insight-mark
```

The script:

1. Boots a Hardhat in-memory chain (unless custom RPC details are provided).
2. Deploys the Insight Access Token (settlement token), Alpha Insight Nova-Seed, and Alpha Insight Exchange.
3. Simulates the meta-agent pipeline, forging three Nova-Seeds with disruption forecasts.
4. Lists the first two seeds on α-AGI MARK, processes a trade, resolves a prediction, drills the delegated sentinel pause/unpause flow, and logs telemetry.
5. Generates Markdown/JSON dossiers under `demo/alpha-agi-insight-mark/reports/` with SHA-256 manifests for audit trails.

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

- `insight-recap.json` – network, contract addresses, minted seed states, and telemetry.
- `insight-report.md` – executive summary with tables and owner command hooks.
- `insight-report.html` – shareable executive dashboard with disruption timeline visualisation.
- `insight-control-matrix.json` – machine-readable owner control registry.
- `insight-control-map.mmd` – mermaid diagram for governance briefings.
- `insight-governance.mmd` – meta-agent swarm and sentinel orchestration schematic.
- `insight-telemetry.log` – time-stamped agent dialogue.
- `insight-manifest.json` – SHA-256 hashes of every generated artefact and the scenario dataset that produced them.

All outputs are designed for direct inclusion in boardroom briefings and investor packets.

## Runbook & Governance Dossiers

- [`runbooks/operator-runbook.md`](runbooks/operator-runbook.md) – step-by-step operator walkthrough.
- [`docs/owner-control-briefing.md`](docs/owner-control-briefing.md) – governance levers, emergency response, and verification checklist.

## Integration with AGI Jobs v0 (v2)

The demo is additive and does not modify existing protocol modules. It relies exclusively on the toolchain shipped with AGI Jobs v0 (v2) and is covered by a dedicated GitHub Actions workflow that enforces unit tests, the demo run, and dossier verification on pull requests targeting this directory.
