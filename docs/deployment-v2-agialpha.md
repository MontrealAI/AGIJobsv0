# Deployment Guide: AGIJobs v2 with $AGIALPHA

This guide shows how to deploy the modular v2 contracts using the helper script at `scripts/v2/deployDefaults.ts`. The script spins up the full stack assuming the 18‑decimal **$AGIALPHA** token already exists. For local networks without the canonical token, deploy [`contracts/test/AGIALPHAToken.sol`](../contracts/test/AGIALPHAToken.sol) and supply its address to the script.

## 1. Run the deployment script

1. Install dependencies with `npm install`.
   ![npm install](https://via.placeholder.com/650x150?text=npm+install)
2. Execute the helper:
   ```bash
   npx hardhat run scripts/v2/deployDefaults.ts --network <network> --governance <address>
   ```
   ![deploy defaults](https://via.placeholder.com/650x150?text=deployDefaults.ts)
   Use `--governance` to set the multisig or timelock owner and `--no-tax` to omit `TaxPolicy`.
3. The script deploys `Deployer.sol`, calls `deployDefaults` (or `deployDefaultsWithoutTaxPolicy`), prints module addresses and verifies each contract on Etherscan.
   ![script output](https://via.placeholder.com/650x150?text=module+addresses)

## 2. Configure token, ENS roots and fees

The default run uses the mainnet `$AGIALPHA` address, a 5% protocol fee and 5% burn, and leaves ENS settings blank. To customise:

- Edit the script to call `deployer.deploy(econ, ids)` instead of `deployDefaults`.
  - `econ.token` – ERC‑20 used by `StakeManager` and `FeePool`.
  - `econ.feePct` / `econ.burnPct` – protocol fee and burn percentages (whole numbers, e.g. `5` for 5%).
  - `ids.agentRootNode` / `ids.clubRootNode` – namehashes for `agent.agi.eth` and `club.agi.eth`.
  - `ids.agentMerkleRoot` / `ids.validatorMerkleRoot` – optional allowlists for off‑chain membership proofs.
  ![config script](https://via.placeholder.com/650x150?text=configure+econ+ids)
- After deployment the owner can still adjust parameters on‑chain with `JobRegistry.setFeePct` and `FeePool.setBurnPct`.

## 3. Post-deploy wiring

`deployDefaults.ts` wires modules automatically. If you deploy contracts individually, complete the wiring manually:

1. On `JobRegistry`, call `setModules(validationModule, stakeManager, reputationEngine, disputeModule, certificateNFT, feePool, new address[](0))`.
   ![setModules](https://via.placeholder.com/650x150?text=setModules)
2. On `StakeManager`, `ValidationModule` and `CertificateNFT`, call `setJobRegistry(jobRegistry)`.
   ![setJobRegistry](https://via.placeholder.com/650x150?text=setJobRegistry)
3. Verify `ModulesUpdated` and `JobRegistrySet` events before allowing user funds.

For function parity with the legacy contract, compare calls against [v1-v2-function-map.md](v1-v2-function-map.md).

Following this sequence results in a ready‑to‑use v2 deployment running on `$AGIALPHA`.

## 4. Transfer ownership to a multisig or timelock

Immediately after wiring, delegate control of every module to a governance
contract:

1. Deploy a multisig wallet or OpenZeppelin `TimelockController`.
2. From the deployer account call `transferOwnership(multisig)` on
   `JobRegistry`, `StakeManager`, `ValidationModule` and all other modules.
3. To rotate owners, the current multisig schedules and executes
   `transferOwnership(newOwner)` and the new address takes effect once the
   `OwnershipTransferred` event is emitted.

Calls sent directly by EOAs will revert after ownership has moved; timelocks
must queue and execute transactions to invoke privileged setters.
