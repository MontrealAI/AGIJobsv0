# AGI Jobs v0 Green-Path Checklist

This checklist distills the ten baseline hardening tasks required to operate AGI Jobs v0 as a recursive-improvement engine targeting **[🔱 ASI Takes Off 🏆✨]**. The items are ordered; complete them sequentially to maintain configuration integrity.

> **Note:** Baseline parameters are intentionally conservative. Adjustments should be routed through governance once the system is live and auditable artifacts are captured.

---

## ☑️ 0. Pre-flight (configuration + wiring sanity)

- [ ] Verify `$AGIALPHA` constants against the on-chain token: `npm run verify:agialpha -- --rpc <RPC-URL>` (append `--timeout <ms>` if required).
- [ ] Run ownership health checks:
  - `npm run owner:doctor -- --network <net> --strict`
  - `npm run owner:audit -- --network <net> --out reports/<net>-owner-audit.md`
- [ ] Validate module wiring: `npm run wire:verify -- --network <net>`.
- [ ] Keep `FeePool.treasury` unset (`address(0)`) until governance is fully active; ensure burn logic remains enabled.

## ☑️ 1. Hand governance to a multisig/timelock (institutional control)

- [ ] Deploy an on-chain Safe (multisig) or OpenZeppelin `TimelockController`.
- [ ] Transfer governance/ownership for all privileged contracts (`StakeManager`, `JobRegistry`, `ValidationModule`, `ReputationEngine`, `IdentityRegistry`, `CertificateNFT`, `DisputeModule`, `FeePool`, `PlatformRegistry`, `JobRouter`, `PlatformIncentives`, `TaxPolicy`, `SystemPause`).
  - CLI helper: `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/transfer-ownership.ts --new-owner <addr>`.
- [ ] Confirm all privileged setters are callable only by the new governance address.

## ☑️ 2. Emergency halt: System-wide pause wiring

- [ ] Transfer ownership of each pausable module to `SystemPause`.
- [ ] Dry-run pause wiring: `npx hardhat run scripts/v2/updateSystemPause.ts --network <net>`.
- [ ] Execute once validation succeeds: append `--execute` to the command.
- [ ] Document the pause/unpause runbook and authorized operators.

## ☑️ 3. ENS identities & allowlists (agents/validators)

- [ ] Configure ENS root nodes on `IdentityRegistry` via `setAgentRootNode(<agent.agi.eth node>)` and `setClubRootNode(<club.agi.eth node>)`.
- [ ] (Optional bootstrap) Set Merkle allowlists: `setAgentMerkleRoot(<root>)`, `setValidatorMerkleRoot(<root>)`.
- [ ] Grant delegated attestation rights as needed using `AttestationRegistry.attest(...)` / `revoke(...)`.
- [ ] Wire `IdentityRegistry` into `JobRegistry` and `ValidationModule` using their respective setters.
- [ ] Enforce ENS proof requirement for all agent/validator actions.

## ☑️ 4. Minimal job lifecycle routing (fees, policy, modules)

- [ ] Set policy hooks: `JobRegistry.setTaxPolicy(<TaxPolicy>)` and `DisputeModule.setTaxPolicy(<TaxPolicy>)`.
- [ ] Register module pointers on `JobRegistry` (`ValidationModule`, `DisputeModule`).
- [ ] Route protocol fees to `FeePool` via `JobRegistry.setFeePool(<FeePool>)`.
- [ ] Defer treasury assignment until governance specifies a treasury address; burn dust in the interim.

## ☑️ 5. Validator timing & quorum bounds (commit-reveal)

- [ ] Configure validation windows:
  - `ValidationModule.setCommitWindow(1800)` (30 minutes).
  - `ValidationModule.setRevealWindow(1800)` (30 minutes).
- [ ] Set committee bounds: `ValidationModule.setValidatorBounds(3, 5)`.
- [ ] Confirm public `finalize` access after the reveal window closes.

## ☑️ 6. Fees, burns, and reward holding

- [ ] Configure `FeePool.burnPct` to 100 bps (1%).
- [ ] Leave `FeePool.treasury` as `address(0)` until governance finalizes splits.
- [ ] Capture parameter changes using the owner ops workflow (`owner:plan`, `owner:update-all`) for auditability.
- [ ] Draft a governance proposal documenting future fee splits.

## ☑️ 7. Staking minima, slashing knobs, and auto-config

- [ ] Prepare a `StakeManager.applyConfiguration` payload setting minimum stakes and treasury allowlist updates.
- [ ] Set minima: agents at `100 AGIALPHA` (1e20 wei), validators at `1,000 AGIALPHA` (1e21 wei).
- [ ] Execute via `owner:plan` followed by `owner:update-all`.
- [ ] Keep slashing conservative—prioritize non-reveal penalties until dispute analytics justify escalation.

## ☑️ 8. Disputes, fees, and council workflows

- [ ] Configure dispute fee: `DisputeModule.setDisputeFee(1e18)` (1 AGIALPHA).
- [ ] Establish the dispute flow (`raiseDispute`, `resolve`) and document evidence submission standards.
- [ ] Provide validator CLI quickstart guidance for commit/reveal rehearsals.
- [ ] Align slashing rules with reveal failures first; defer outcome-based slashing until audited.

## ☑️ 9. Certificates, SLAs, and verifiability

- [ ] Set the certificate NFT base URI via `CertificateNFT.setBaseURI('ipfs://<CID>/')`.
- [ ] Ensure `ValidationModule.finalize(jobId)` triggers certificate minting and payout release.
- [ ] Include SLA terms and cryptographic proofs in job metadata for employer verification.

## ☑️ 10. End-to-end rehearsal (fork + testnet), then publish the green light

- [ ] Run the quickstart E2E script suite (post job, stake, validate, finalize, dispute) on a fork and public testnet.
- [ ] Validate parity against Etherscan write-tab workflows.
- [ ] Export ownership reports (`owner:guide`, `owner:audit`) and publish gas/coverage artifacts to `reports/`.
- [ ] Test emergency pause/unpause procedures in a sandbox environment.

---

### Parameter Baselines (pilot → governance-tunable)

| Domain            | Parameter      | Baseline            |
| ----------------- | -------------- | ------------------- |
| Validation timing | `commitWindow` | 1,800 seconds       |
|                   | `revealWindow` | 1,800 seconds       |
| Committee size    | `min,max`      | 3, 5 validators     |
| Dispute           | `disputeFee`   | 1 AGIALPHA (1e18)   |
| FeePool           | `burnPct`      | 100 bps (1%)        |
| Staking minima    | Agents         | 100 AGIALPHA        |
|                   | Validators     | 1,000 AGIALPHA      |
| Treasury          | address        | `address(0)` (pilot)|
| ENS               | Roots          | agent & club nodes  |

---

### Acceptance Criteria

- `owner:doctor` and `wire:verify` run cleanly with governance owning every privileged module.
- At least one job completes the full lifecycle on both fork and testnet with a 3-validator committee and NFT mint confirmation.
- Pause/unpause flow is executed without leaving the system in an inconsistent state.

