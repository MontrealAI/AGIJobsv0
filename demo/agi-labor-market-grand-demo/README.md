# AGI Jobs v2 – Sovereign Labour Market Grand Demo

The grand demo pairs a production-configured Hardhat simulation with a
non-technical control room that proves the AGI Jobs v2 stack can be steered,
paused, and audited instantly. It ships in two parts:

1. [`scripts/v2/agiLaborMarketGrandDemo.ts`](../../scripts/v2/agiLaborMarketGrandDemo.ts)
   – boots every production module, funds actors, executes two cross-border job
   lifecycles, slashes a misbehaving validator, and records a rich transcript of
   owner actions and market telemetry.
2. [`demo/agi-labor-market-grand-demo/ui`](./ui) – a self-contained dashboard that
   turns the transcript into a sovereign mission-control interface for
   non-technical operators.

## One-command quick start (recommended)

```bash
npm install               # first run only
npm run demo:agi-labor-market:dashboard
```

The helper script runs the full Hardhat simulation, exports the transcript to
`demo/agi-labor-market-grand-demo/ui/export/latest.json`, and serves the dashboard
on <http://localhost:4173>. The terminal prints the exact URL. Press `Ctrl+C` to
stop the server.

### What the dashboard highlights

- **Empowerment scoreboard** – total jobs executed, value settled, certificates
  minted, governance interventions, and validator penalties.
- **Owner command readiness** – pass/fail checks for pause drills, delegated
  authority, and baseline restoration so the owner knows they remain in charge.
- **Scenario narratives** – full balance deltas, fee burn, dispute resolution,
  and credential issuance for both cooperative and contentious jobs.
- **Live action log** – searchable ledger of every contract call made by the
  owner during the drill, rendered with parameters and timestamps.

Everything is auto-generated from the Hardhat transcript. No manual wiring,
frontend bundling, or solidity compilation is required.

## Manual CLI usage (advanced)

You can run the Hardhat script directly when you only need the console output or
want to export a transcript without serving the UI:

```bash
npx hardhat run --no-compile scripts/v2/agiLaborMarketGrandDemo.ts --network hardhat
```

To emit a transcript JSON for custom tooling:

```bash
npm run demo:agi-labor-market:export
```

Set `AGI_JOBS_DEMO_EXPORT=/path/to/file.json` to override the destination.

Once a transcript exists you can re-launch the dashboard without rerunning the
simulation:

```bash
npm run demo:agi-labor-market:dashboard -- --serve-only
```

## Scenario coverage

The script deploys and wires the production modules – **JobRegistry**,
**StakeManager**, **ValidationModule**, **ReputationEngine**, **FeePool**,
**DisputeModule**, **CertificateNFT**, and **IdentityRegistry** – then executes:

1. **Cooperative climate coordination** – validators unanimously approve, the
   employer supplies a burn receipt, protocol fees split correctly, and the
   agent receives a credential NFT.
2. **Cross-border dispute** – validators disagree, one refuses to reveal, the
   owner + moderator sign a dispute resolution siding with the agent, the
   non-revealing validator is penalised, and escrow distributes accordingly.

Throughout the run the owner calibrates protocol fees, validator incentives, and
commit/reveal windows, delegates pauser powers, executes emergency pause drills
for both the owner and moderator, then restores the baseline configuration –
proving complete operational authority.

## Technology assumptions

- Node.js 20+ with repository dependencies installed (`npm install`).
- The Hardhat network is launched automatically; no external RPC or fork is
  required.
- The demo ships prebuilt bytecode/ABIs, so no Solidity compilation is needed.

## Extending or replaying

- Re-run the helper command to replay the scenario with fresh deterministic
  accounts.
- Tune validator behaviour, fees, or dispute outcomes by editing
  `scripts/v2/agiLaborMarketGrandDemo.ts` – the dashboard automatically reflects
  the new transcript.
- Drop additional transcript JSON files into `ui/export/` to archive historic
  runs or compare mainnet rehearsals against the local baseline.
