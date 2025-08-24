# Migration Guide

All legacy AGIJobManager contracts have been moved to the `legacy/` directory. The table below links common v0/v1 contracts to the modules that replace them in v2.

| Legacy contract | v2 replacement |
| --- | --- |
| `AGIJobManagerv0.sol`, `AGIJobManagerv1.sol` | Combination of `JobRegistry`, `StakeManager`, `ValidationModule`, `ReputationEngine`, `DisputeModule`, `CertificateNFT`, `FeePool` |
| `JobRegistry.sol` | `contracts/v2/JobRegistry.sol` |
| `StakeManager.sol` | `contracts/v2/StakeManager.sol` |
| `ValidationModule.sol` | `contracts/v2/ValidationModule.sol` |
| `DisputeModule.sol`, `DisputeResolution.sol` | `contracts/v2/modules/DisputeModule.sol` |
| `ReputationEngine.sol` | `contracts/v2/ReputationEngine.sol` |
| `CertificateNFT.sol` | `contracts/v2/CertificateNFT.sol` |
| `AGIALPHAToken.sol` | `contracts/v2/AGIALPHAToken.sol` |

For function‑level differences see:

- [v0 → v2 function map](v0-v2-function-map.md)
- [v1 → v2 function map](v1-v2-function-map.md)

## Job URI Hash Migration

`JobRegistry` v2 now emits the full job URI in `JobCreated` but only stores a
`bytes32` hash of the URI on-chain. Existing deployments that previously stored
the URI string should:

1. Extract historical job URIs from prior `JobCreated` events.
2. Compute `keccak256(bytes(uri))` for each and persist the resulting hash
   off-chain for reference.
3. When redeploying or upgrading, initialise new jobs with the computed hash and
   supply the original URI when emitting replacement `JobCreated` events if
   needed.
4. Update any off-chain services or certificate minting logic to provide the
   `uriHash` instead of the raw URI.

