# Tax Obligations in the AGI Job Platform Ecosystem

The AGI Jobs protocol routes all tax duties to the participants who exchange value and none to the contract owner. The smart contract is inert code: it never charges fees, holds revenue, or transfers tokens to the deploying corporation. Consequently the platform and its owner have no taxable events in any jurisdiction. The dedicated [`TaxPolicy`](../contracts/v2/TaxPolicy.sol) contract anchors this principle on‑chain by storing a canonical policy URI and returning a plain‑text acknowledgement—"AGI Employers, Agents, and Validators handle all taxes; the contract and owner are tax-exempt"—so non‑technical users can confirm the disclaimer through explorers like Etherscan.

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
- May update the `TaxPolicy` URI but remain tax‑exempt regardless of jurisdiction.

## Passive Token Holders
- Passive holders unaffected by burns or job flows until they dispose of their own tokens.

## Responsibilities
Participants must track their own transactions and consult professional advisers for jurisdiction‑specific reporting. The platform and its owner do not provide tax services or reporting.

