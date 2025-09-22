# Provider-Agnostic Deployment Guide

This guide explains how to deploy the AGI Jobs v2 protocol using the
`scripts/deploy/providerAgnosticDeploy.ts` Hardhat script. The process is
provider-neutral—only network configuration changes between environments.
The script wires every module, verifies token metadata, runs an end-to-end
integration scenario on staging/local networks, and hands ownership to the
configured governance multisig.

## Prerequisites

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Generate constants** – ensure `contracts/v2/Constants.sol` reflects the
   intended `$AGIALPHA` configuration.
   ```bash
   npm run compile
   ```
3. **Network configuration**
   - Token metadata: `config/agialpha.json` (or
     `config/agialpha.<network>.json`).
   - ENS settings: `config/ens.json` (or network-specific override).
   - Optional deployment overrides: `deployment-config/<network>.json`.

Hardhat automatically picks the right config variant based on `--network`,
`HARDHAT_NETWORK`, or `AGIALPHA_NETWORK`.

## Environment Variables

| Variable                                    | Description                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOVERNANCE_ADDRESS`                        | Multisig/timelock address that will own the system after deployment. Defaults to `governance.govSafe` in the token config or the deployer if unset. |
| `TREASURY_ADDRESS`                          | Treasury recipient for `StakeManager`/`FeePool` (defaults to the deployer).                                                                         |
| `MIN_STAKE`                                 | Optional minimum agent stake (tokens with 18 decimals).                                                                                             |
| `EMPLOYER_SLASH_PCT` / `TREASURY_SLASH_PCT` | Optional StakeManager slashing split (0–100).                                                                                                       |
| `DISPUTE_FEE` / `DISPUTE_WINDOW`            | Optional dispute configuration.                                                                                                                     |
| `COMMIT_WINDOW` / `REVEAL_WINDOW`           | Validator commit/reveal windows (seconds).                                                                                                          |
| `MIN_VALIDATORS` / `MAX_VALIDATORS`         | Validation committee bounds.                                                                                                                        |
| `JOB_FEE_PCT` / `JOB_STAKE`                 | Initial JobRegistry fee percentage and stake requirement.                                                                                           |
| `FEEPOOL_BURN_PCT`                          | Portion of collected fees to burn (0–100).                                                                                                          |
| `TAX_POLICY_URI` / `TAX_ACK_TEXT`           | Initial tax policy metadata.                                                                                                                        |

Environment variables override JSON config values. Parameters not supplied
fall back to sensible defaults.

## Running the Script

1. **Local/staging deployment**

   ```bash
   npx hardhat run scripts/deploy/providerAgnosticDeploy.ts --network hardhat
   ```

   - When the target token is absent, the script injects
     `contracts/test/AGIALPHAToken.sol` bytecode at the configured
     `$AGIALPHA` address and mints staging balances.
   - An end-to-end integration scenario executes automatically: an employer
     creates a job, an agent submits work, validators commit/reveal, and
     funds are finalized through the FeePool.

2. **Public testnet or mainnet**

   ```bash
   npx hardhat run scripts/deploy/providerAgnosticDeploy.ts --network sepolia
   ```

   - The script **refuses** to mock the token on live networks; `config/agialpha.<network>.json`
     must reference the already-deployed `$AGIALPHA` token.
   - Integration checks are skipped unless the deployer controls the token
     (no minting rights). You may run the scenario later on a fork by
     re-running the script against a Hardhat network configured to fork the
     target chain.

3. **Post-run output** – the script prints every module address:
   ```
   StakeManager        0x...
   ReputationEngine    0x...
   ...
   AttestationRegistry 0x...
   ```
   Store these addresses in the corresponding `config/agialpha.<network>.json`
   (and governance docs) after confirming on-chain state.

## Token Metadata Verification

Before any deployment steps, the script calls
`verifyAgialpha` to ensure:

- Configured token address matches `contracts/v2/Constants.sol`.
- Symbol, name, decimals, and burn address align.
- Optional on-chain metadata (if an RPC endpoint is available) equals the
  JSON configuration.

A mismatch aborts deployment to prevent wiring contracts with incorrect
constants.

## Governance Handover

After wiring and optional integration tests, ownership transfers proceed:

- `StakeManager`, `JobRegistry`, `FeePool` call `setGovernance` with the
  multisig.
- All `Ownable` modules (Validation, Reputation, Dispute, CertificateNFT,
  IdentityRegistry, TaxPolicy, ArbitratorCommittee, AttestationRegistry)
  call `transferOwnership` to the same address.
- If a two-step ownable contract is used (e.g., `TaxPolicy`), governance must
  call `acceptOwnership` post-deployment.

## Post-Deployment Validation

1. **Wire verification**
   ```bash
   npm run verify:wiring -- --network <network>
   ```
2. **Token metadata audit**
   ```bash
   npm run verify:agialpha -- --network <network>
   ```
3. **Manual checks**
   - Confirm module addresses in each contract’s read interface.
   - Ensure governance multisig is the owner/governor across contracts.

Following this procedure keeps deployments deterministic, chain-agnostic,
fully wired, and verified prior to production cut-over.
