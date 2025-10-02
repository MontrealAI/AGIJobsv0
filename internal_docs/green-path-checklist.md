# AGI Jobs v0 Green-Path Checklist

This document captures the baseline configuration and operational drills required to bring **AGI Jobs v0** into a governed "green" state that is ready to compound into the [🔱 ASI Takes Off 🏆✨] roadmap. Each task mirrors the upstream runbook while recording the command surface that exists in this repository and any governance sensitivities. Teams should mark completion status and attach evidence (transaction hashes, reports, screenshots) before advancing.

> **Note:** Commands assume a properly configured `.env`/Hardhat environment. Replace `<net>` with the deployed network (e.g., `sepolia`, `op-sepolia`, `mainnet-fork`) and provide RPC URLs, signer keys, and Safe addresses via environment variables or CLI flags as required.

---

## 0. Pre-flight (configuration & wiring sanity)

**Goal:** Confirm the live token constants, ownership graph, and module wiring match expectations before parameter tuning.

- [ ] `npm run verify:agialpha -- --rpc <RPC-URL> [--timeout <ms>]`
- [ ] `npm run owner:doctor -- --network <net> --strict`
- [ ] `npm run owner:audit -- --network <net> --out reports/<net>-owner-audit.md`
- [ ] `npm run wire:verify -- --network <net>`
- [ ] Validate FeePool treasury remains `address(0)` until governance activates treasury routing.

---

## 1. Governance handoff (multisig/timelock)

**Goal:** Eliminate single-key risk by ensuring all privileged setters are controlled by a Safe or OZ `TimelockController`.

- [ ] Deploy Safe/timelock (record address).
- [ ] `StakeManager.setGovernance(<governanceAddress>)`
- [ ] `JobRegistry.setGovernance(<governanceAddress>)`
- [ ] `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/transfer-ownership.ts --new-owner <governanceAddress>` targeting: `ValidationModule`, `ReputationEngine`, `IdentityRegistry`, `CertificateNFT`, `DisputeModule`, `FeePool`, `PlatformRegistry`, `JobRouter`, `PlatformIncentives`, `TaxPolicy`, `SystemPause`.
- [ ] Record the proposal transaction bundle in governance documentation.

---

## 2. Emergency halt wiring

**Goal:** Route pausable modules through `SystemPause` so a single switch can halt critical flows.

- [ ] Confirm ownership of pausable modules already points to `SystemPause`.
- [ ] Dry run: `npx hardhat run scripts/v2/updateSystemPause.ts --network <net>`
- [ ] Execute with `--execute` once checks pass.
- [ ] Document pause/unpause runbook and authorized operators.

---

## 3. ENS identities & allowlists

**Goal:** Enforce Sybil resistance via ENS registrations and optional Merkle allowlists.

- [ ] `IdentityRegistry.setAgentRootNode(<agent.agi.eth node>)`
- [ ] `IdentityRegistry.setClubRootNode(<club.agi.eth node>)`
- [ ] (Optional) `IdentityRegistry.setAgentMerkleRoot(<root>)`
- [ ] (Optional) `IdentityRegistry.setValidatorMerkleRoot(<root>)`
- [ ] Wire registry: `JobRegistry.setIdentityRegistry(<IdentityRegistry>)`
- [ ] Wire registry: `ValidationModule.setIdentityRegistry(<IdentityRegistry>)`
- [ ] If using attestations: `AttestationRegistry.attest(node, role, address)` / `revoke(...)`

---

## 4. Minimal job lifecycle routing

**Goal:** Ensure job creation, validation, and finalization are deterministic and auditable.

- [ ] `JobRegistry.setTaxPolicy(<TaxPolicy>)`
- [ ] `DisputeModule.setTaxPolicy(<TaxPolicy>)`
- [ ] `JobRegistry.setModules({ validation: <ValidationModule>, dispute: <DisputeModule>, ... })`
- [ ] `JobRegistry.setFeePool(<FeePool>)`
- [ ] Treasury left unset (`address(0)`); any future update must pass governance review.

---

## 5. Validator timing & committee bounds

**Goal:** Configure commit-reveal timing and validator quorum sizes.

- [ ] `ValidationModule.setCommitWindow(1800)`
- [ ] `ValidationModule.setRevealWindow(1800)`
- [ ] `ValidationModule.setValidatorBounds(3, 5)`
- [ ] Confirm that `ValidationModule.finalize(jobId)` is callable by anyone post-reveal window.

---

## 6. Fees, burns, and reward routing

**Goal:** Fix economic flows with conservative burn parameters and no treasury leakage.

- [ ] Set FeePool burn percentage via owner ops (`owner:plan` → `owner:update-all`) to **100 bps (1%)**.
- [ ] Confirm FeePool treasury remains `address(0)`; document future target splits for governance proposal.
- [ ] Verify protocol fees from `JobRegistry` route into `FeePool` on finalization.

---

## 7. Staking minima & slashing knobs

**Goal:** Require meaningful stakes for agents and validators; prepare future slashing policy.

- [ ] Construct `StakeManager.applyConfiguration` payload setting:
  - Agent minimum stake: `100 AGIALPHA` (1e20)
  - Validator minimum stake: `1,000 AGIALPHA` (1e21)
- [ ] Execute via `owner:plan` / `owner:update-all` workflow and archive plan output.
- [ ] Document runtime staking flow for participants (`approve` + `StakeManager.depositStake`).
- [ ] Note: keep slashing limited to non-reveal penalties until data supports outcome-based rules.

---

## 8. Disputes & council workflows

**Goal:** Provide a dispute escalation path with economic deterrents.

- [ ] `DisputeModule.setDisputeFee(1e18)` (1 AGIALPHA).
- [ ] Publish operator CLI walkthrough for `commitValidation`, `revealValidation`, `raiseDispute`.
- [ ] Capture dispute resolution policy and council signer list under governance docs.

---

## 9. Certificates, SLAs, verifiability

**Goal:** Produce tamper-evident proof artifacts for completed jobs.

- [ ] `CertificateNFT.setBaseURI('ipfs://<CID>/')`
- [ ] Validate `finalize(jobId)` emits certificate mint and reward release events.
- [ ] Document SLA metadata requirements and hash-signing workflow.

---

## 10. End-to-end rehearsal & publication

**Goal:** Demonstrate the full pipeline on fork and testnet, then publish evidence.

- [ ] Run quickstart script: `node -e "(async () => { await require('./examples/ethers-quickstart').postJob(); })()"`
- [ ] Stake representative validator: `node -e "(async () => { await require('./examples/ethers-quickstart').stake('1'); })()"`
- [ ] Perform commit/reveal via CLI helpers (`validate`, `computeValidationCommit`).
- [ ] Exercise dispute flow: `dispute(jobId, 'ipfs://evidence')`.
- [ ] Test emergency pause/unpause on sandbox deployment.
- [ ] Store generated artifacts (`owner:guide`, audits, gas/coverage reports) under `reports/`.
- [ ] Publish governance-ready summary referencing all transaction hashes and evidence.

---

### Acceptance Definition

- All verification and owner doctor checks pass with recorded outputs.
- Governance owns every privileged module; transactions captured in Safe/timelock history.
- At least one fork and one public testnet rehearsal complete with 3-validator committee, finalized rewards, and certificate mint.
- Emergency pause/unpause validated without locking funds.

Keep this checklist version-controlled and update with annotations, links, and results as the system advances toward full governance activation.
