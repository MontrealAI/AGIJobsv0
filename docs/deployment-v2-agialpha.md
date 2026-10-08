# Deployment Guide: AGIJobs v2 with $AGIALPHA

For the full production deployment process see [deployment-production-guide.md](deployment-production-guide.md).

This guide shows how to deploy the modular v2 contracts using the helper script at `scripts/v2/deployDefaults.ts`. For context on each module's responsibility and how they fit together, see [architecture-v2.md](architecture-v2.md). The script spins up the full stack assuming the 18‑decimal **$AGIALPHA** token already exists. On `hardhat`, `localhost`, and `anvil`, the script installs a local token fixture at the configured canonical address when it is absent. Public networks require the real token at the compiled address; supplying an unrelated token address does not change the contracts’ settlement token.

## 1. Run the deployment script

1. Use the Node and npm versions pinned in `.nvmrc` and `package.json`, then install the exact lockfile and compile.

   ```bash
   npm ci
   npm run compile
   npm run release:check-size
   ```

2. Copy [`deployment-config/deployer.sample.json`](../deployment-config/deployer.sample.json) to a network-specific reviewed file. Replace its zero governance address and placeholder tax URI, and set the economic and identity parameters. Use a fresh output filename for each run.

   ```bash
   DEPLOY_DEFAULTS_CONFIG=deployment-config/reviewed-sepolia.json \
   DEPLOY_DEFAULTS_OUTPUT=reports/sepolia-deployment.json \
   npx hardhat run scripts/v2/deployDefaults.ts --network sepolia
   ```

   `hardhat run` accepts Hardhat options such as `--network`; it does **not** forward arbitrary script flags. In particular, `--config` selects a **Hardhat JavaScript/TypeScript configuration**, not deployment JSON. The environment variables above are the supported Hardhat command path.

   For an isolated rehearsal without a private RPC or funded wallet:

   ```bash
   DEPLOY_DEFAULTS_SKIP_VERIFY=1 \
   DEPLOY_DEFAULTS_OUTPUT=/tmp/agi-jobs-local-deployment.json \
   npx hardhat run scripts/v2/deployDefaults.ts --network hardhat
   ```

   The in-process Hardhat chain disappears when this command exits. Use a persistent local node with `--network localhost` when testing services against the deployed addresses. Local success does not commission a public deployment.

   Advanced callers can invoke the script directly through `ts-node`, where its own options are supported:

   ```bash
   HARDHAT_NETWORK=sepolia npx ts-node --transpile-only \
     --compiler-options '{"module":"commonjs"}' scripts/v2/deployDefaults.ts \
     --config deployment-config/reviewed-sepolia.json \
     --output reports/sepolia-deployment.json
   ```

   The JSON accepts `econ` (fee/burn/slashing percentages, commit/reveal durations, minimum/job stakes), `identity` (ENS registry, wrapper, root nodes and optional Merkle roots), `governance`, and `tax`. Zero economic values select the contract’s defaults; an explicit zero-fee policy must be applied later through reviewed governance transactions. Tax metadata updates require accepted governance ownership.

3. The script deploys `Deployer.sol`, calls `deployDefaults` (or `deployDefaultsWithoutTaxPolicy` when `tax.enabled` is false), prints module addresses, applies requested governance updates (including the optional tax-policy metadata) and verifies each contract on Etherscan.

   Example output:

   ```text
   Deployer deployed at: 0xDeployer
   JobRegistry: 0xRegistry
   StakeManager: 0xStake
   ...
   ```

## 2. Configure token, ENS roots and fees

The default run uses the compiled `$AGIALPHA` address, a 5% protocol fee, 1% burn and one-day commit/reveal windows, and loads ENS data from `config/ens.<network>.json` (falling back to `config/ens.json`). The deployment report reads effective economics from confirmed contracts. Customise values with CLI flags or a config file instead of editing TypeScript:

- Economic settings live under `econ`. Percentages accept integers (`5`) or decimals (`0.05`). Token amounts accept decimal strings or 0x-prefixed base units.
- Identity settings accept either ENS names (automatically namehashed) or explicit `0x…` values. Leave Merkle roots unset to default to zero.
- Tax settings enable or disable `TaxPolicy` and optionally supply replacement metadata. When governance is available the script automatically calls `setPolicy(uri, text)`.

Example JSON snippet:

```json
{
  "econ": {
    "feePct": 6,
    "burnPct": 4,
    "commitWindow": "36h",
    "revealWindow": 86400,
    "minStake": "2500",
    "jobStake": "100"
  },
  "identity": {
    "clubRootNode": "club.agi.eth",
    "agentRootNode": "agent.agi.eth",
    "validatorMerkleRoot": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "agentMerkleRoot": "0x0000000000000000000000000000000000000000000000000000000000000000"
  },
  "tax": {
    "enabled": true,
    "uri": "ipfs://QmExample",
    "description": "Taxes fall on employers, agents and validators"
  }
}
```

After deployment the owner can still adjust parameters on-chain via the module setters (e.g. `JobRegistry.setFeePct`, `FeePool.setBurnPct`, `StakeManager.setSlashingPercentages`). Run these adjustments through the owner ops workflow (`npm run owner:plan` then `npm run owner:update-all`) so every change remains auditable.

## 3. Post-deploy wiring

`deployDefaults.ts` wires modules automatically. If you deploy contracts individually, complete the wiring manually:

1. On `JobRegistry`, call `setModules(validationModule, stakeManager, reputationEngine, disputeModule, certificateNFT, feePool, new address[](0))`.

   ```solidity
   jobRegistry.setModules(
     validationModule,
     stakeManager,
     reputationEngine,
     disputeModule,
     certificateNFT,
     feePool,
     new address[](0)
   );
   ```

2. On `StakeManager`, `ValidationModule` and `CertificateNFT`, call `setJobRegistry(jobRegistry)`.

   ```solidity
   stakeManager.setJobRegistry(jobRegistry);
   validationModule.setJobRegistry(jobRegistry);
   certificateNFT.setJobRegistry(jobRegistry);
   ```

3. Verify `ModulesUpdated` and `JobRegistrySet` events before allowing user funds.

For function parity with the legacy contract, compare calls against [v0-v2-function-map.md](legacy/v0-v2-function-map.md).

Before commissioning, verify every dependency and caller permission, complete governance acceptance, configure certificate metadata, rehearse pause/unpause and recovery, and satisfy the [production readiness gates](production/readiness-2026-10-03.md). Deployment alone does not establish production readiness.

## 4. Transfer ownership to a multisig or timelock

The staged deployer transfers operational modules to `SystemPause`, whose owner is the requested governance address. Other modules are handed directly to governance. `IdentityRegistry` and `TaxPolicy` require a final `acceptOwnership()` transaction: the script completes it only when governance is the connected deployer; otherwise the report lists `pendingOwnership` for the multisig to complete. Custom tax policy metadata must be set after that acceptance. Do not overwrite the `SystemPause` ownership topology with a blanket transfer.

The following manual procedure applies only to separately deployed modules, not a completed staged deployment:

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
