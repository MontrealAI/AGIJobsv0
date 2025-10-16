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
   - deploys the NovaSeedNFT, AlphaMarkRiskOracle, AlphaMarkEToken, and AlphaSovereignVault contracts
   - performs investor buys and validator approvals
   - pauses and resumes trading to verify safety controls
   - demonstrates pre-launch base asset retargeting (ETH -> ERC-20 stablecoin)
   - proves the sovereign vault pause/unpause circuit breaker
   - finalizes the launch with ignition metadata and prints a comprehensive recap
   - emits an owner parameter matrix table in the console and inside the recap dossier

2. **Inspect recap artifacts**

   At the end of the run the script emits a JSON recap under `demo/alpha-agi-mark/reports/alpha-mark-recap.json` **and** a
   cinematic HTML dashboard at `demo/alpha-agi-mark/reports/alpha-mark-dashboard.html`. The recap dossier contains:

   - contract addresses
   - owner governance parameters
   - consolidated `ownerControls` snapshot of every pause/whitelist/override lever
   - validator council roster and votes
   - bonding curve statistics (supply, reserve balance, pricing)
   - launch outcome summary, including sovereign vault manifest, acknowledgement metadata, and treasury balance
   - `ownerParameterMatrix` providing a full owner control matrix with descriptions
   - cross-reference visuals from the [`Operator Empowerment Atlas`](../docs/operator-empowerment-atlas.md) and
     [`Operator Command Console`](../docs/operator-command-console.md) for stakeholder briefings

3. **Render the owner control matrix at any time**

   ```bash
   npm run owner:alpha-agi-mark
   ```

   The command reads the latest recap dossier and prints a tabular summary of every operator control lever.

4. **Render (or re-render) the sovereign dashboard**

   ```bash
   npm run dashboard:alpha-agi-mark
   ```

   This regenerates the HTML dossier using the latest recap JSON, useful after manual parameter tweaks.

5. **(Optional) Run unit tests**

   ```bash
   npx hardhat test --config demo/alpha-agi-mark/hardhat.config.ts
   ```

6. **(Optional) Dry-run on a fork or external network**

   Set environment variables before invoking the script:

   ```bash
   export AGIJOBS_DEMO_DRY_RUN=false
   export ALPHA_MARK_NETWORK=sepolia
   export ALPHA_MARK_RPC_URL=https://...
   export ALPHA_MARK_OWNER_KEY=0x...
   export ALPHA_MARK_INVESTOR_KEYS=0x...,0x...,0x...
   export ALPHA_MARK_VALIDATOR_KEYS=0x...,0x...,0x...
   npm run demo:alpha-agi-mark
   ```

   Provide keys for at least three investors and three validators; the script confirms each wallet holds ≥0.05 ETH and prompts for
   a `launch` acknowledgement before any mainnet/testnet transactions proceed.

## Emergency Controls

- `pause()` halts buys while still allowing redemptions when emergency exit is active.
- `abort()` activates emergency exit and keeps the bonding curve solvent for participant withdrawals.
- `overrideValidation()` lets the owner force a green light or red light if the validator council stalls.
- `resetApprovals()` clears validator votes instantly so a fresh review cycle can begin after any incident.

These controls are showcased live in the demo.
