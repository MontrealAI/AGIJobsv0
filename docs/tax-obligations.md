# Tax Obligations in the AGI Job Platform Ecosystem

The AGI Jobs protocol routes all tax duties to the participants who exchange value and none to the contract owner. The smart contract is inert code: it never charges fees, holds revenue, or transfers tokens to the deploying corporation. Consequently the platform and its owner have no taxable events in any jurisdiction and remain exempt from direct, indirect, or theoretical taxes. This neutrality holds globally—United States, Canada, the European Union, and beyond—because the infrastructure never realises income or disposes of assets. The dedicated [`TaxPolicy`](../contracts/v2/TaxPolicy.sol) contract anchors this principle on‑chain by storing both a canonical policy URI **and** a human‑readable acknowledgement string—each controlled solely by the owner—so non‑technical users can confirm the disclaimer through explorers like Etherscan. Call `policyDetails` to fetch both fields at once, `acknowledgement` (or `acknowledge`) and `policyURI` individually on the `TaxPolicy` contract, or `taxPolicyDetails` on `JobRegistry`. `isTaxExempt()` on both contracts returns `true` for additional assurance. Only the owner can update these values via `setPolicyURI`, `setAcknowledgement`, or `setPolicy`; unauthorized calls revert.
All other core modules—`StakeManager`, `ValidationModule`, `ReputationEngine`, `DisputeModule`, and `CertificateNFT`—likewise expose `isTaxExempt()` helpers so explorers can verify that neither those contracts nor the owner can ever accrue tax liability.

`JobRegistry` maintains an incrementing `taxPolicyVersion` and records the last acknowledged version per address in `taxAcknowledgedVersion`. Any update or explicit version bump by the owner requires employers, agents, and validators to call `acknowledgeTaxPolicy` again before interacting, keeping the tax disclaimer evergreen while the platform itself remains tax‑exempt.

## Employers
- Provide the token escrow that funds jobs.
- When a job finalizes, a portion of the employer's deposit is burned.
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
- Do not mint, burn, or transfer tokens for themselves.
- Provide infrastructure without consideration, so no sales/VAT/GST applies.
- Therefore incur zero direct, indirect, or theoretical tax liability worldwide.
 - May update the `TaxPolicy` URI and acknowledgement (individually or atomically) but remain tax‑exempt regardless of jurisdiction.

## Passive Token Holders
- Passive holders unaffected by burns or job flows until they dispose of their own tokens.

## Responsibilities
Participants must track their own transactions and consult professional advisers for jurisdiction‑specific reporting. The platform and its owner do not provide tax services or reporting.

