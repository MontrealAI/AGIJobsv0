# AGI Jobs v0 Green-Path Checklist

This playbook enumerates the ten blocking actions required before operating AGI Jobs v0 as a governed, recursively-improving network. Execute each task in order and record the resulting artefacts inside `reports/` for governance review.

## 0. Pre-flight validation

**Goal:** Confirm that configuration files, generated constants, and live contract wiring agree before touching privileged parameters.

1. Confirm the canonical `$AGIALPHA` metadata matches the configuration.
   ```bash
   npm run verify:agialpha -- --rpc <RPC-URL> [--timeout <ms>]
   ```
2. Run the governance ownership doctor and audit in dry-run mode to expose any privilege gaps.
   ```bash
   npm run owner:doctor -- --network <network> --strict
   npm run owner:audit -- --network <network> --out reports/<network>-owner-audit.md
   ```
3. Verify module wiring against ENS roots and configured hashes.
   ```bash
   npm run wire:verify -- --network <network>
   ```

> **Baseline:** Leave every treasury field unset (`address(0)`) while governance is bootstrapping so no fees are routed to an uncontrolled wallet. FeePool burns stay enabled (see Task 6).

## 1. Governance handoff

**Goal:** Move every privileged setter behind a multisig or timelock to eliminate single-key risk.

- Deploy a Safe or OpenZeppelin `TimelockController`.
- Point `StakeManager` and `JobRegistry` governance to the new controller: `StakeManager.setGovernance(<addr>)`, `JobRegistry.setGovernance(<addr>)`.
- Transfer ownership for all ownable modules (Validation, Reputation, Identity, Certificates, Dispute, FeePool, PlatformRegistry, JobRouter, PlatformIncentives, TaxPolicy, SystemPause) to the same controller. The helper script can batch the transfers:
  ```bash
  npx ts-node --compiler-options '{"module":"commonjs"}' scripts/transfer-ownership.ts --new-owner <addr>
  ```

> **Baseline:** After this step only the controller can invoke privileged setters.

## 2. Emergency pause wiring

**Goal:** Guarantee a single on-chain switch can halt job execution if operators detect abuse.

1. Transfer ownership of each pausable module to `SystemPause`.
2. Dry-run the pause wiring script and execute once validations pass:
   ```bash
   npx hardhat run scripts/v2/updateSystemPause.ts --network <network>
   npx hardhat run scripts/v2/updateSystemPause.ts --network <network> --execute
   ```

> **Baseline:** Governance retains control over `SystemPause`; document who is authorised to pause/unpause.

## 3. ENS identities and allowlists

**Goal:** Enforce ENS-backed identities for agents and validators to mitigate Sybil attacks.

- Set ENS root nodes on `IdentityRegistry` and optionally configure bootstrap Merkle roots:
  ```bash
  IdentityRegistry.setAgentRootNode(<agent.agi.eth node>)
  IdentityRegistry.setClubRootNode(<club.agi.eth node>)
  IdentityRegistry.setAgentMerkleRoot(<root>)    # optional
  IdentityRegistry.setValidatorMerkleRoot(<root>)# optional
  ```
- Delegate attestations when needed via `AttestationRegistry.attest(node, role, address)` / `revoke(...)`.
- Wire the registry into all dependent modules: `JobRegistry.setIdentityRegistry(<addr>)` and `ValidationModule.setIdentityRegistry(<addr>)`.

> **Baseline:** Require ENS proofs on every `apply` and `commit` call (subdomains follow `<name>.agent.agi.eth` and `<name>.club.agi.eth`).

## 4. Job lifecycle routing

**Goal:** Ensure creation → validation → finalisation flows use the intended policy, dispute, and fee contracts.

- Configure the policy references:
  ```bash
  JobRegistry.setTaxPolicy(<TaxPolicy>)
  DisputeModule.setTaxPolicy(<TaxPolicy>)
  JobRegistry.setModules(...ValidationModule, ...DisputeModule)
  JobRegistry.setFeePool(<FeePool>)
  ```
- Delay any treasury configuration until governance finalises the target wallet. If a treasury must be used, allowlist it via `FeePool.setTreasuryAllowlist(<addr>, true)` before calling `FeePool.setTreasury(<addr>)`.

> **Baseline:** Treasury remains `address(0)` until Task 6 formalises burn and split parameters.

## 5. Validator timing and quorum

**Goal:** Lock in validation timing windows that balance latency and liveness.

```bash
ValidationModule.setCommitWindow(1800)  # 30 minutes
ValidationModule.setRevealWindow(1800)  # 30 minutes
ValidationModule.setValidatorBounds(3, 5)
```

Anyone may call `ValidationModule.finalize(jobId)` after the reveal window closes.

> **Baseline:** Operate with 3-of-5 validator committees until throughput data suggests an update.

## 6. Fees, burns, and escrow

**Goal:** Route employer fees through `FeePool`, burn a fixed share, and escrow the remainder for stakers.

- Set the burn percentage via the owner ops workflow (preferred) or the direct setter.
- Keep `FeePool.treasury` unset (`address(0)`) so dust is burned during the pilot.

> **Baseline:** `burnPct = 100` bps (1%). Track future treasury splits in a draft governance proposal before execution.

## 7. Staking minima and slashing

**Goal:** Define minimum stakes and conservative slashing rules to ensure skin-in-the-game.

- Use the aggregated configuration helper:
  ```bash
  StakeManager.applyConfiguration(<ConfigUpdate>, <TreasuryAllowlistUpdate[]>)
  ```
- Pilot parameters:
  - Agent minimum stake: `100 AGIALPHA` (`1e20` wei)
  - Validator minimum stake: `1,000 AGIALPHA` (`1e21` wei)
- Stakers approve and deposit via `$AGIALPHA.approve(StakeManager, amount)` then `StakeManager.depositStake(role, amount)` where roles are `0` (agent) and `1` (validator).

> **Baseline:** Focus on light non-reveal penalties; defer heavy outcome-based slashing until dispute data is available.

## 8. Dispute workflow

**Goal:** Provide a clear escalation path and refundable dispute fees.

- Set an accessible dispute fee:
  ```bash
  DisputeModule.setDisputeFee(1e18)  # 1 AGIALPHA
  ```
- Runtime flow:
  - Raise disputes via `JobRegistry.raiseDispute(jobId, "ipfs://evidence")` (or `acknowledgeAndDispute`).
  - Governance resolves cases with `DisputeModule.resolve(...)` according to policy.
- Optional: use the validator CLI quickstarts to simulate commits, reveals, and challenges before broadcasting transactions.

> **Baseline:** Treat failure to reveal within the window as slashing-eligible once sufficient data supports the penalty schedule.

## 9. Certificates and SLAs

**Goal:** Mint verifiable completion records for agents and expose SLA metadata.

- Set the base URI once for certificate NFTs:
  ```bash
  CertificateNFT.setBaseURI('ipfs://<CID>/')
  ```
- After successful reveals and `ValidationModule.finalize(jobId)`, confirm that rewards release and certificates mint to the winning agent. Ensure job metadata contains SLA details and signed artefact hashes.

> **Baseline:** Expose the CID and result hash in the UI so employers can verify signatures locally.

## 10. End-to-end rehearsal

**Goal:** Rehearse the full happy path on a fork and public testnet before production.

- Developer quickstart loop:
  ```bash
  node -e "(async () => { await require('./examples/ethers-quickstart').postJob(); })()"
  node -e "(async () => { await require('./examples/ethers-quickstart').stake('1'); })()"
  validate(jobId, approveBool, { subdomain, proof, skipFinalize: true })
  computeValidationCommit(jobId, approve, { burnTxHash: '0x..' })
  dispute(jobId, 'ipfs://evidence')
  ```
- Etherscan parity drill: `createJob` → `applyForJob` → `commitValidation` → `revealValidation` → `ValidationModule.finalize(jobId)` → `raiseDispute` (if required).
- Archive artefacts (owner guides, audits, gas/coverage reports) under `reports/` for governance.

> **Baseline:** Rehearse against a mainnet fork for gas accuracy and repeat on Sepolia or OP-Sepolia using the documented environment variables (`SEPOLIA_RPC_URL`, etc.).

## Parameter baseline summary

| Domain              | Parameter         | Baseline value        | Setter / helper |
| ------------------- | ----------------- | --------------------- | --------------- |
| Validation timing   | `commitWindow`    | 1,800 seconds         | `ValidationModule.setCommitWindow` |
|                     | `revealWindow`    | 1,800 seconds         | `ValidationModule.setRevealWindow` |
| Committee size      | `min`, `max`      | 3, 5                  | `ValidationModule.setValidatorBounds` |
| Dispute             | `disputeFee`      | 1 AGIALPHA            | `DisputeModule.setDisputeFee` |
| FeePool             | `burnPct`         | 100 bps (1%)          | Owner ops plan / `FeePool.setBurnPct` |
| Staking minima      | Agent             | 100 AGIALPHA          | `StakeManager.applyConfiguration` |
|                     | Validator         | 1,000 AGIALPHA        | `StakeManager.applyConfiguration` |
| Treasury            | `treasury`        | `address(0)`          | `FeePool.setTreasury` (deferred) |
| ENS                 | Roots             | Agents / clubs set    | `IdentityRegistry.setAgentRootNode`, `setClubRootNode` |

## Acceptance criteria

- `npm run owner:doctor` and `npm run wire:verify` pass without errors for the target network.
- At least one job finalises end-to-end with a three-validator committee on fork and testnet, including NFT minting and log capture.
- Emergency pause / unpause is rehearsed in a sandbox with no stranded state.

Document successful runs and governance approvals so the network can demonstrate readiness for the **ASI Takes Off** initiative.
