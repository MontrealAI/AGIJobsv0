# AGI Jobs v0 Green-Path Execution Log

This template captures auditable evidence for each step of the AGI Jobs v0 hardening checklist. Duplicate the file when running a new environment rehearsal (e.g. `cp reports/green-path-execution-template.md reports/green-path-execution-<network>-<date>.md`). Attach referenced artifacts (command outputs, transaction receipts, governance proposals) in the `reports/` directory.

> **Usage note:** Fill in the _Status_ column with `✅` (complete), `🚧` (in progress), or `❌` (blocked). Provide links to command logs, proposal payloads, or Etherscan transactions for every completed action.

| Task | Description | Status | Evidence / Links | Operator Notes |
|------|-------------|--------|------------------|----------------|
| 0.1  | `npm run verify:agialpha -- --rpc <RPC-URL>` |  |  |  |
| 0.2  | `npm run owner:doctor -- --network <net> --strict` |  |  |  |
| 0.3  | `npm run owner:audit -- --network <net> --out reports/<net>-owner-audit.md` |  |  |  |
| 0.4  | `npm run wire:verify -- --network <net>` |  |  |  |
| 0.5  | Confirm `FeePool.treasury == address(0)` |  |  |  |
| 1.1  | Deploy Safe / Timelock governance |  |  |  |
| 1.2  | Transfer ownership for privileged modules |  |  |  |
| 1.3  | Verify privileged setters restricted to governance |  |  |  |
| 2.1  | Transfer pausable modules to `SystemPause` |  |  |  |
| 2.2  | Dry-run `updateSystemPause.ts` |  |  |  |
| 2.3  | Execute `updateSystemPause.ts --execute` |  |  |  |
| 2.4  | Document pause/unpause operators |  |  |  |
| 3.1  | Configure ENS roots (`setAgentRootNode`, `setClubRootNode`) |  |  |  |
| 3.2  | (Optional) Apply agent/validator Merkle roots |  |  |  |
| 3.3  | Configure delegated attestations |  |  |  |
| 3.4  | Wire `IdentityRegistry` into `JobRegistry` and `ValidationModule` |  |  |  |
| 3.5  | Enforce ENS proofs in client/operator guides |  |  |  |
| 4.1  | Set `JobRegistry` / `DisputeModule` tax policy |  |  |  |
| 4.2  | Register module pointers on `JobRegistry` |  |  |  |
| 4.3  | Route protocol fees to `FeePool` |  |  |  |
| 4.4  | Confirm treasury remains unset |  |  |  |
| 5.1  | `ValidationModule.setCommitWindow(1800)` |  |  |  |
| 5.2  | `ValidationModule.setRevealWindow(1800)` |  |  |  |
| 5.3  | `ValidationModule.setValidatorBounds(3,5)` |  |  |  |
| 5.4  | Confirm public finalize path |  |  |  |
| 6.1  | Set `FeePool.burnPct = 100 bps` |  |  |  |
| 6.2  | Log owner ops plan/update artifacts |  |  |  |
| 6.3  | Draft governance proposal for future fee splits |  |  |  |
| 7.1  | Construct `StakeManager.applyConfiguration` payload |  |  |  |
| 7.2  | Apply agent minimum stake (100 AGIALPHA) |  |  |  |
| 7.3  | Apply validator minimum stake (1,000 AGIALPHA) |  |  |  |
| 7.4  | Publish slashing posture statement |  |  |  |
| 8.1  | Set `DisputeModule.setDisputeFee(1e18)` |  |  |  |
| 8.2  | Document dispute evidence standards |  |  |  |
| 8.3  | Provide validator CLI rehearsal guide |  |  |  |
| 8.4  | Align slashing with reveal failures |  |  |  |
| 9.1  | `CertificateNFT.setBaseURI('ipfs://<CID>/')` |  |  |  |
| 9.2  | Verify finalize → mint flow |  |  |  |
| 9.3  | Publish SLA + proof requirements |  |  |  |
| 9.4  | Configure certificate gateway pipeline |  |  |  |
|10.1  | Run quickstart fork rehearsal |  |  |  |
|10.2  | Run Sepolia/OP-Sepolia rehearsal |  |  |  |
|10.3  | Validate Etherscan write-tab parity |  |  |  |
|10.4  | Export owner/gas/coverage artifacts |  |  |  |
|10.5  | Test pause/unpause sandbox |  |  |  |

## Sign-off Checklist

- [ ] All evidence linked above has been reviewed by governance.
- [ ] Resulting configuration hashes recorded in `deployment-config/` manifests.
- [ ] Emergency contact roster updated.
- [ ] Follow-up governance proposals drafted (if parameters deviate from baseline).

## Appendix

- **Fork/Testnet snapshots:** Document block numbers or snapshots used for rehearsals.
- **Change management:** Reference pull requests, multisig transaction IDs, or timelock proposal IDs associated with each step.
- **Lessons learned:** Capture operational improvements or unexpected issues encountered during execution.

