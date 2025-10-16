# α-AGI MARK Runbook

This document guides an operator (no engineering background required) through the alpha MARK demonstration. Everything runs on a local Hardhat network – no external RPC endpoints or funding keys are needed.

## Prerequisites

- Node.js 20 (already specified in repo `.nvmrc`).
- `npm install` executed at the repository root.

## Command summary

| Action | Command | Notes |
| --- | --- | --- |
| Execute automated tests | `npm run test:alpha-agi-mark` | Verifies contract math, validator controls, and owner governance. |
| Run the full demo | `npm run demo:alpha-agi-mark` | Preferred entry point – identical to `demo/alpha-agi-mark/bin/run-demo.sh`. |
| Capture reports | Automatically generated under `reports/alpha-agi-mark/` | Contains `summary.json` and `ledger.json`. |

## Narrative walkthrough

1. **Bootstrap** – `run-demo.ts` deploys `NovaSeedNFT` and mints a single Nova-Seed. You’ll see a log similar to:
   ```
   ➡️  seed.mint: Nova-Seed 1 minted with encrypted foresight genome (tx: 0x...)
   ```

2. **Bonding-curve launch** – The MARK contract is deployed and custody of the Nova-Seed is transferred to it. Investors A, B, and C acquire shares along a deterministic curve. Observe the price increase with each purchase.

3. **Compliance controls** – The owner toggles whitelist mode and immediately blocks an outsider account. This demonstrates regulatory gating (e.g., accredited investor requirements). Later the whitelist is relaxed to reopen the market.

4. **Emergency pause** – The owner pauses trading. Any incoming trade fails with the `EnforcedPause` error, proving the presence of an immediate kill-switch. Trading resumes once the owner unpauses.

5. **Validator oracle** – Validators A and B approve the seed. Validator C initially rejects, then clears and reissues an approval after deliberation. The `SeedGreenLit` event (visible in Hardhat logs) confirms that the approval threshold is achieved.

6. **Sovereign elevation** – An `AlphaSovereignVault` contract is deployed. Calling `finalizeLaunch` transfers the entire reserve balance into the vault and freezes further trading. A subsequent buy attempt intentionally fails to show that launch locking works.

7. **Reporting** – The script writes two JSON files:
   - `reports/alpha-agi-mark/ledger.json`: chronological ledger of significant actions.
   - `reports/alpha-agi-mark/summary.json`: owner parameter snapshot (validators, whitelist status, share balances, sovereign address).

You can hand these artefacts to auditors or decision-makers as proof of execution.

## Troubleshooting

- **`EnforcedPause`** when running the demo: ensure no manual pause occurred before executing the script. The script itself unpauses when needed.
- **Missing dependencies**: re-run `npm install` at the repository root.
- **Clearing state**: Hardhat scripts launch an ephemeral node; simply re-run the command for a clean environment.

## Next steps

- Customise `run-demo.ts` to simulate additional validators or alternative pricing slopes.
- Use `AlphaSovereignVault.forwardFunds` to demonstrate downstream capital deployment.
- Feed the generated JSON artefacts into dashboards or knowledge graphs to extend the storytelling.

AGI Jobs v0 (v2) keeps these complex operations accessible – execute once, brief stakeholders immediately.
