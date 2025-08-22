# Deployment Guide: AGIJobs v2 with $AGIALPHA

This guide shows how to deploy the modular v2 contracts using the helper script at `scripts/v2/deployDefaults.ts`. The script spins up the full stack with the 6‑decimal **$AGIALPHA** token and wires modules automatically.

## 1. Run the deployment script

1. Install dependencies with `npm install`.
   ![npm install](https://via.placeholder.com/650x150?text=npm+install)
2. Execute the helper:
   ```bash
   npx hardhat run scripts/v2/deployDefaults.ts --network <network>
   ```
   ![deploy defaults](https://via.placeholder.com/650x150?text=deployDefaults.ts)
   Use `--no-tax` to omit `TaxPolicy`.
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
- After deployment the owner can still adjust parameters on‑chain with `StakeManager.setToken`, `FeePool.setToken`, `JobRegistry.setFeePct` and `FeePool.setBurnPct`.

## 3. Post-deploy wiring

`deployDefaults.ts` wires modules automatically. If you deploy contracts individually, complete the wiring manually:

1. On `JobRegistry`, call `setModules(stakeManager, validationModule, reputationEngine, disputeModule, certificateNFT, platformRegistry, jobRouter, platformIncentives, feePool, taxPolicy)`.
   ![setModules](https://via.placeholder.com/650x150?text=setModules)
2. On `StakeManager`, `ValidationModule` and `CertificateNFT`, call `setJobRegistry(jobRegistry)`.
   ![setJobRegistry](https://via.placeholder.com/650x150?text=setJobRegistry)
3. Verify `ModulesUpdated` and `JobRegistrySet` events before allowing user funds.

For function parity with the legacy contract, compare calls against [v1-v2-function-map.md](v1-v2-function-map.md).

Following this sequence results in a ready‑to‑use v2 deployment running on `$AGIALPHA`.
