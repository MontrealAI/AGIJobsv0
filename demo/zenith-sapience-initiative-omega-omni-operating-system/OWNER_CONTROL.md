# Owner Control & Governance Authority

The Omega Omni Operating System centres governance authority around the contract owner (typically a multisig). The following levers provide full control over parameters, pausing, upgrades, and emergency response—without editing Solidity.

## Unified Change Pipeline

1. **Draft** – Update JSON manifests under `config/` (fee pool, stake manager, job registry, thermostat, reward engine, identity registry, etc.).
2. **Validate** – Run the wizard:
   ```bash
   npm run owner:wizard -- --network <network> --out runtime/wizard.md
   ```
   `scripts/v2/owner-config-wizard.ts` ensures addresses, enums, and bounds align with deployed contracts.
3. **Plan** – Produce the batched transaction plan:
    ```bash
    npm run owner:update-all -- --network <network> --json | tee runtime/plan.json
    ```
    Append `--safe runtime/plan.safe.json` to export a Gnosis Safe bundle ready for multisig signatures.
4. **Execute** – Re-run with `--execute` once approvals are collected:
   ```bash
   npm run owner:update-all -- --network <network> --execute
   ```
5. **Verify** – Confirm invariants and dashboards:
   ```bash
   npm run owner:verify-control -- --network <network>
   npm run owner:dashboard -- --network <network> --out runtime/dashboard.md
   ```

This pipeline guarantees that every governance change is rehearsed, diffed, signed, and audited before touching mainnet.

## Parameter Inventory

| Module | Governing Script | Key Parameters |
| --- | --- | --- |
| Fee Pool | `scripts/v2/updateFeePool.ts` | Treasury splits, burn rate, reward routing. |
| Stake Manager | `scripts/v2/updateStakeManager.ts` | Minimum stake, bond duration, slash ratios. |
| Job Registry | `scripts/v2/updateJobRegistry.ts` | Employer deposits, validation windows, dispute fees. |
| Reward Engine | `scripts/v2/updateRewardEngine.ts` | Emission weights, validator shares, treasury hooks. |
| Thermostat & Thermodynamics | `scripts/v2/updateThermostat.ts`, `scripts/v2/updateThermodynamics.ts` | PID gains, set points, epoch schedules. |
| Identity Registry | `scripts/v2/updateIdentityRegistry.ts` | ENS attestations, operator allowlists. |
| Energy Oracle & Hamiltonian Monitor | `scripts/v2/updateEnergyOracle.ts`, `scripts/v2/updateHamiltonianMonitor.ts` | Oracle signers, KPI sampling windows. |
| Platform Registry & Incentives | `scripts/v2/updatePlatformRegistry.ts`, `scripts/v2/updatePlatformIncentives.ts` | Vertical enablement flags, baseline payouts. |
| Tax Policy | `scripts/v2/updateTaxPolicy.ts` | Jurisdiction metadata, withholding percentages. |

Every script respects the owner-only modifiers baked into the Solidity contracts, enforcing that no external actor can bypass governance.

## Emergency Powers

| Scenario | Command | Outcome |
| --- | --- | --- |
| Immediate halt | `npx hardhat console --network <network>` → `await (await ethers.getContractAt('SystemPause', '<address>')).connect(await ethers.getSigner('<governance>')).pauseAll();` | Executes the `SystemPause.pauseAll()` governance transaction described in `docs/system-pause.md`. |
| Controlled resume | `npx hardhat console --network <network>` → `await (await ethers.getContractAt('SystemPause', '<address>')).connect(await ethers.getSigner('<governance>')).unpauseAll();` | Calls `SystemPause.unpauseAll()` to restore normal operations after mitigation. |
| Rotate governance keys | `npm run owner:rotate -- --network <network>` | Invokes `scripts/v2/rotateGovernance.ts` to update multisig signers and ownership addresses. |
| Validator intervention | `npm run owner:command-center -- --network <network> --out runtime/command.json` | Produces a curated intervention checklist covering validator rotations, disputes, and treasury adjustments (including pause status). |
| Incident tabletop | `npm run incident:tabletop` | Runs the security tabletop to rehearse communication, dispute, and remediation workflows. |

These commands empower the owner to freeze the economy, rotate keys, and coordinate remediation within minutes.

> **Address discovery:** Use `npm run owner:surface -- --network <network>` or inspect `config/agialpha.<network>.json` to confirm the `SystemPause` and governance addresses before issuing the Hardhat console calls.

## Upgrade Strategy

1. **Prepare new implementation** – Deploy updated logic contracts using `npm run deploy:oneclick:wizard` or bespoke Hardhat scripts.
2. **Generate migration bundle** –
   ```bash
   npm run migrate:wizard -- --network <network> --out runtime/migration.md
   npm run migrate:preflight -- --network <network>
   ```
   Validates ABI compatibility and captures the proposed proxy upgrades.
3. **Schedule via timelock** – Configure the timelock with `scripts/v2/migrateGovernanceTimelock.ts` if delayed execution is required.
4. **Execute via multisig** – Use `npm run owner:update-all -- --network <network> --execute` targeting the proxy admin to apply the upgrade after the timelock expires.
5. **Post-upgrade verification** – Run `npm run owner:verify-control`, `npm run observability:smoke`, and `npm run check:access-control` to confirm behaviour matches expectations.

## Audit & Compliance Hooks

- **Dashboard Evidence** – `npm run owner:dashboard` and `npm run owner:diagram` produce markdown + Mermaid files for board-level reporting.
- **Parameter Matrix** – `npm run owner:parameters -- --network <network>` enumerates every configurable constant with on-chain vs manifest comparisons.
- **Config Audit** – `npm run owner:audit -- --network <network>` generates the attestation pack demanded by external auditors.
- **Branch Protection** – `npm run ci:verify-branch-protection` ensures GitHub enforces the full CI gate for any change touching governance code.

The combination of deterministic scripts, archived artefacts, and CI enforcement gives the owner complete, provable control over the AGI Jobs v0 (v2) platform.
