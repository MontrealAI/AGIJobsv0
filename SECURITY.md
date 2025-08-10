# Security Guidelines

## Ownership Transfer to a Multisig
1. Deploy or identify a secure multisig wallet (e.g., Gnosis Safe).
2. From the current owner account, call `transferOwnership(<multisig_address>)` on each Ownable contract.
3. Wait for confirmations and verify the `OwnershipTransferred` event includes the new multisig owner.
4. Confirm the transfer by calling `owner()` and checking that it returns the multisig address.

## Verifying Module Address Updates
When updating module addresses, ensure the transaction emits the expected events:
- `ValidationModuleUpdated(address)` when setting a new validation module.
- `DisputeModuleUpdated(address)` when setting a new dispute module.
- `JobRegistryUpdated(address)` when modules such as `CertificateNFT` or `StakeManager` update their registry reference.

## Static Analysis Commands
- **Slither:** `slither . --solc-remaps @openzeppelin=node_modules/@openzeppelin/`
- **Foundry:**
  - `forge build`
  - `forge test`
