# Tax Obligations in the AGI Job Platform Ecosystem

**Summary**

- Employers, agents, and validators shoulder all tax liability.
- The smart contracts and deploying corporation remain tax‑exempt everywhere, confirmed by `isTaxExempt()`.
- Only employers can finalize jobs and trigger token burns; the platform never initiates nor receives burned tokens.
- Verify the policy on Etherscan: read `taxPolicyDetails`, acknowledge via `acknowledgeTaxPolicy` (which emits `TaxAcknowledged(user, version, acknowledgement)`), and check `isTaxExempt`.
- The owner edits the policy text or URI with `setPolicyURI`/`setAcknowledgement`, tracks changes via `policyVersion`, and bumps `policyVersion` using `bumpPolicyVersion`.
- Retrieve per-user acceptance with `acknowledgedVersion(address)`.

The AGI Jobs protocol routes all tax duties to the participants who exchange value and none to the contract owner. The smart contract is inert code: it never charges fees, holds revenue, or transfers tokens to the deploying corporation. Consequently the platform and its owner have no taxable events in any jurisdiction and remain exempt from direct, indirect, or theoretical taxes. This neutrality holds globally—United States, Canada, the European Union, and beyond—because the infrastructure never realises income or disposes of assets. The dedicated [`TaxPolicy`](../contracts/v2/TaxPolicy.sol) contract anchors this principle on‑chain by storing both a canonical policy URI **and** a human‑readable acknowledgement string—each controlled solely by the owner—so non‑technical users can confirm the disclaimer through explorers like Etherscan. Call `policyDetails` to fetch both fields at once, `acknowledgement` (or `acknowledge`) and `policyURI` individually on the `TaxPolicy` contract, or `taxPolicyDetails` on `JobRegistry`. `policyVersion` reveals the current version and `bumpPolicyVersion` increments it without altering text. `isTaxExempt()` on both contracts returns `true` for additional assurance. Only the owner can update these values via `setPolicyURI`, `setAcknowledgement`, `setPolicy`, or `bumpPolicyVersion`; unauthorized calls revert.
All other core modules—`StakeManager`, `ValidationModule`, `ReputationEngine`, `DisputeModule`, and `CertificateNFT`—likewise expose `isTaxExempt()` helpers so explorers can verify that neither those contracts nor the owner can ever accrue tax liability.

`TaxPolicy` records acknowledgement state per address and exposes `hasAcknowledged(address)` alongside the canonical `policyVersion`. Any update or explicit version bump by the owner requires employers, agents, and validators to call `acknowledgeTaxPolicy` again before interacting, keeping the tax disclaimer evergreen while the platform itself remains tax‑exempt. Modules enforce this requirement with the `requiresTaxAcknowledgement` modifier from [`libraries/TaxAcknowledgement.sol`](../contracts/v2/libraries/TaxAcknowledgement.sol):

```solidity
function createJob(uint256 reward, string memory uri)
    external
    requiresTaxAcknowledgement(
        taxPolicy,
        msg.sender,
        owner(),
        address(disputeModule),
        address(stakeManager)
    )
{
    // job creation logic
}
```

### Etherscan steps

1. Open the `JobRegistry` address on Etherscan.
2. Under **Read Contract**, call `taxPolicyDetails` to view the current policy text and URI and check `TaxPolicy.policyVersion`.
3. Switch to **Write Contract** and call `acknowledgeTaxPolicy` to accept the active version. The transaction emits `TaxAcknowledged(user, version, acknowledgement)` containing the disclaimer text.
4. Back under **Read Contract**, verify `isTaxExempt` returns `true` and call `TaxPolicy.hasAcknowledged(address)` to confirm acknowledgement.
5. Owners can update the text or URI via `setPolicyURI`, `setAcknowledgement`, `setPolicy`, or `bumpPolicyVersion` on `TaxPolicy` to force participants to re‑acknowledge.

## Employers

- Provide the token escrow that funds jobs.
- Only the employer can finalize jobs by calling `acknowledgeAndFinalize(jobId)` from their own wallet.
- That finalization burns a portion of the employer's deposit; the protocol never initiates or benefits from burns.
- Burning is a disposal of property, so employers record any capital gain or loss on the burned amount based on cost basis versus fair market value at burn.
- Token payments to agents may be deductible business expenses where applicable.

## Agents

- Receive tokens as compensation for completed work.
- Token value at receipt is ordinary income; later sales trigger capital gains or losses relative to this basis.
- Burned tokens never belong to agents and have no tax impact on them.

## Validators

- If rewarded for validation, tokens received are income; later sales realise capital gains or losses.
- Validators with no rewards have no tax consequences.

## Platform Owner and Contract

- Collect no fees and never take custody of tokens.
- Any fee remainder is burned or forwarded to a community-controlled or
  dedicated burn address; the owner cannot receive leftover tokens.
- Do not mint, burn, or transfer tokens for themselves.
- Never finalize jobs or receive burned tokens; burns only destroy employer deposits.
- Provide infrastructure without consideration, so no sales/VAT/GST applies.
- Therefore incur zero direct, indirect, or theoretical tax liability worldwide.
- May update the `TaxPolicy` URI and acknowledgement (individually or atomically) but remain tax‑exempt regardless of jurisdiction.

## Passive Token Holders

- Passive holders unaffected by burns or job flows until they dispose of their own tokens.

## Responsibilities

Participants must track their own transactions and consult professional advisers for jurisdiction‑specific reporting. The platform and its owner do not provide tax services or reporting.
