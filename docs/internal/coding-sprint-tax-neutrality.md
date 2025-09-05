# Coding Sprint: Tax Neutrality & Participant Responsibilities

This sprint focuses on keeping the AGI Jobs protocol and its deploying corporation perpetually tax‑exempt while routing all tax duties to active participants. Jurisdictional neutrality must hold globally—United States, Canada, European Union, and beyond—because the infrastructure earns no revenue, collects no fees, and never disposes of assets. The plan builds on the v2 architecture and mirrors the rationale in [`tax-obligations.md`](../tax-obligations.md).

## Objectives

- Ensure only AGI Employers, Agents, and Validators ever incur tax obligations.
- Provide owner‑controlled on‑chain messaging so non‑technical users can verify the disclaimer via Etherscan.
- Keep every module revenue‑free and incapable of accepting stray ether.
- Surface explicit `isTaxExempt()` helpers so explorers can prove the owner and contracts remain outside any tax scope.

## Tasks

1. **TaxPolicy contract**
   - Deploy an `Ownable` helper that stores a canonical policy URI and human‑readable acknowledgement text.
   - Emit `TaxPolicyURIUpdated` and `AcknowledgementUpdated` events on changes.
   - Reject all ETH via `receive`/`fallback`, expose `policyDetails()` for explorer reads, and return `true` from `isTaxExempt()`.
2. **JobRegistry integration**
   - Rely on `TaxPolicy.hasAcknowledged(address)` for per-user tracking instead of a local mapping.
   - Gate user actions with `requiresTaxAcknowledgement` so only acknowledged participants may interact.
   - Surface `taxPolicyDetails()`, `taxAcknowledgement()`, `taxPolicyURI()`, and `isTaxExempt()` for read‑only explorer access.
   - Allow the owner to update the policy address or force a fresh acknowledgement with `bumpPolicyVersion` on `TaxPolicy`.
3. **Explorer UX**
   - Document in the README and `etherscan-guide.md` how users call `acknowledgeTaxPolicy` and how the owner updates the policy via `setPolicyURI`, `setAcknowledgement`, or `setPolicy`.
4. **Testing**
   - Write Hardhat tests covering owner‑only setters, acknowledgement gating, and version bumps.
   - Confirm every core contract reverts on unexpected ETH transfers.
5. **Documentation**
   - Expand `README.md` and `tax-obligations.md` with cross‑jurisdiction language making clear the contracts and owner are always exempt.
   - Highlight that the owner may update policy text or URI without ever taking custody of tokens or fees.

## Definition of Done

- All modules compile and revert on direct ETH transfers.
- `acknowledgeTaxPolicy` gating is enforced in tests.
- README and explorer guides show step‑by‑step Etherscan usage with `isTaxExempt()` checks.
- The contract owner alone can update tax policy messaging and trigger version bumps.
