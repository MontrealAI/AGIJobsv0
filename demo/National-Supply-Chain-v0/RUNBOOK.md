# Mission Control Runbook – National Supply Chain Demo

This runbook guides non-technical operators through launching, verifying, and
replaying the Meta-Agentic national supply chain simulation. Follow the steps in
order; every action provides immediate terminal feedback.

## 1. Environment preparation

1. Install dependencies once:
   ```bash
   npm install
   ```
2. Ensure no other Hardhat instance is running. The scripts start an ephemeral
   in-memory chain automatically.

## 2. Execute the grand demo

Run the full demonstration with narration:
```bash
npm run demo:national-supply-chain
```
The script performs the following:
- Deploys all AGI Jobs v2 production modules.
- Configures sovereign identities, stakes, and treasury balances.
- Executes the Arctic corridor mission (happy path), the Pacific relief dispute
  (with arbitration), and the quadratic treasury referendum with delegated
  execution and reward sweeps.
- Prints real-time balances, validator states, minted credentials, and owner
  override confirmations.

### Owner authority drill highlights

During the run the script intentionally:
- Adjusts protocol fees, burn percentage, validator rewards, dispute fees, and
  stake guardrails.
- Exercises `SystemPause` delegation and restoration.
- Logs every owner override to `ownerActions` in the transcript so auditors can
  replay the commands.

## 3. Export and validate a fresh transcript

The CLI can emit a structured JSON export consumed by the UI and runbook
validation tools.
```bash
npm run demo:national-supply-chain:export
```
This writes `demo/National-Supply-Chain-v0/ui/export/latest.json`.

Cross-check the export with both validation engines:
```bash
npm run demo:national-supply-chain:cross-verify
```
The cross-validator enforces the Zod schema, verifies chronological ordering,
and confirms that every minted credential maps to an orchestrated scenario.

Immediately validate the invariants that prove unstoppable governance:
```bash
npm run demo:national-supply-chain:validate
```
The validator enforces timeline depth, owner authority drills, treasury
graduations, validator quorum composition, and the unstoppable mission score.

## 4. Review the mission control dashboard

Serve the UI with any static web server:
```bash
npx serve demo/National-Supply-Chain-v0/ui
```
Open the printed URL. You will see:
- Timeline of every mission event.
- Token movement snapshots.
- Owner parameter changes and pause drills.
- Automation recommendations for the next operator.
- Copy buttons next to every command so you can paste into the terminal without
  typing.

## 5. Autoreplay + UI loop (optional)

Launch the integrated control room which automatically refreshes the transcript
and hosts the UI:
```bash
npm run demo:national-supply-chain:control-room
```
- Press **Enter** to rerun the full simulation.
- Type `q` then Enter to terminate the server and Hardhat instance.

## 6. Continuous verification (CI)

The repository runs `.github/workflows/demo-national-supply-chain.yml` on every
relevant pull request. The workflow executes the export command, runs both the
cross-verifier and the imperative validator, checks that `timeline`,
`ownerActions`, `scenarios`, `market.agentPortfolios`, and
`ownerControl.baseline` are populated, and uploads the transcript artefact. A
failed workflow blocks merges, ensuring the demo always remains executable.

## 7. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Hardhat exits with `EADDRINUSE` | Another Hardhat node is running. Terminate it or rerun the script. |
| Transcript missing after export | Check terminal output for reverts. Ensure `demo/National-Supply-Chain-v0/ui/export` is writable. |
| UI shows stale data | Rerun the export command or press Enter in the control room loop. |
| Need to reset | Delete `demo/National-Supply-Chain-v0/ui/export/latest.json` and rerun the export command. |

All scripts are deterministic; re-running them restores the canonical sovereign
state showcased in the walkthrough.
