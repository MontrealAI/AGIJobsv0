# Mainnet Fork Job Lifecycle Rehearsal

This report captures the end-to-end rehearsal executed against a Hardhat mainnet fork on 2025-10-02. The drill exercises the full job lifecycle using the canonical $AGIALPHA token balances from the forked state.

## Environment

- RPC endpoint: `https://ethereum.publicnode.com`
- Local fork: Hardhat node (`npx hardhat node --fork ...`)
- Test harness: `npm run test:fork`

## Actions

1. Compiled protocol contracts with optimizer + viaIR (`npx hardhat compile`).
2. Reset the forked chain, zeroed base fee to avoid 1559 issues, and pre-funded participants with $AGIALPHA balances directly in storage.
3. Deployed the v2 module stack (StakeManager, JobRegistry, ValidationModule stub, FeePool, TaxPolicy, ReputationEngine, IdentityRegistry, DisputeModule, CertificateNFT).
4. Wired modules and governance relationships (module installer not required for the rehearsal).
5. Acknowledged tax policy for employer and agent, granted additional agent status in the identity registry, and removed reputation barriers.
6. Executed the complete lifecycle: agent staking, job creation, application, submission, validation, employer finalization, and NFT resale.

## Evidence

- Hardhat log: [`reports/mainnet-fork-test.log`](./mainnet-fork-test.log)
- Contracts and participant configuration referenced in `test/fork/mainnet-job-lifecycle.fork.test.ts`.

## Notes

- The rehearsal uses the validation stub for deterministic commits. The full commit/reveal helpers are covered by the production validation module tests.
- The same harness can target Sepolia or OP-Sepolia by exporting `MAINNET_RPC_URL` to the corresponding RPC endpoints before invoking `npm run test:fork`.
- Gas reporting for the rehearsal is embedded in the test output; CI retains coverage and gas artifacts for governance review.
