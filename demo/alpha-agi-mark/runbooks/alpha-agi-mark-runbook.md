# α-AGI MARK Demo Runbook

This runbook describes how a non-technical operator can execute the α-AGI MARK foresight market demo from scratch.

## Prerequisites

- Node.js v20.18.1 (already enforced by repository engines)
- `npm install`

## Execution Steps

1. **Launch the demo**

   ```bash
   npm run demo:alpha-agi-mark
   ```

   The orchestrator automatically:

   - boots a Hardhat chain
   - deploys the NovaSeedNFT, AlphaMarkRiskOracle, and AlphaMarkEToken contracts
   - performs investor buys and validator approvals
   - pauses and resumes trading to verify safety controls
   - finalizes the launch and prints a comprehensive recap

2. **Inspect recap artifacts**

   At the end of the run the script emits a JSON recap under `demo/alpha-agi-mark/reports/alpha-mark-recap.json`. It contains:

   - contract addresses
   - owner governance parameters
   - consolidated `ownerControls` snapshot of every pause/whitelist/override lever
   - validator council roster and votes
   - bonding curve statistics (supply, reserve balance, pricing)
   - launch outcome summary

3. **(Optional) Run unit tests**

   ```bash
   npx hardhat test --config demo/alpha-agi-mark/hardhat.config.ts
   ```

4. **(Optional) Dry-run on a fork or external network**

   Set environment variables before invoking the script:

   ```bash
   export AGIJOBS_DEMO_DRY_RUN=false
   export ALPHA_MARK_NETWORK=sepolia
   export ALPHA_MARK_OWNER_KEY=0x...
   npm run demo:alpha-agi-mark
   ```

   The script will prompt for confirmation before broadcasting transactions when `AGIJOBS_DEMO_DRY_RUN=false`.

## Emergency Controls

- `pause()` halts buys while still allowing redemptions when emergency exit is active.
- `abort()` activates emergency exit and keeps the bonding curve solvent for participant withdrawals.
- `overrideValidation()` lets the owner force a green light or red light if the validator council stalls.
- `resetApprovals()` clears validator votes instantly so a fresh review cycle can begin after any incident.

These controls are showcased live in the demo.
