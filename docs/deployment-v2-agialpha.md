# Deployment Guide: AGIJobs v2 with $AGIALPHA

For the full production deployment process see [deployment-production-guide.md](deployment-production-guide.md).

This guide shows how to deploy the modular v2 contracts using the helper script at `scripts/v2/deployDefaults.ts`. For context on each module's responsibility and how they fit together, see [architecture-v2.md](architecture-v2.md). The script spins up the full stack assuming the 18‑decimal **$AGIALPHA** token already exists. For local networks without the canonical token, deploy [`contracts/test/AGIALPHAToken.sol`](../contracts/test/AGIALPHAToken.sol) and supply its address to the script.

## 1. Run the deployment script

1. Install dependencies with `npm install`.

   ```bash
   npm install
   ```

2. Execute the helper. Pass the network, governance owner and optionally a configuration file:

   ```bash
   npx hardhat run scripts/v2/deployDefaults.ts \
     --network <network> \
     --governance <address> \
     --config deployment-config/deployer.sample.json
   ```

   Useful flags:

   - `--config <path>` – load a JSON file describing economic, identity and tax parameters. A template lives at [`deployment-config/deployer.sample.json`](../deployment-config/deployer.sample.json).
   - `--fee`, `--burn`, `--employer-slash`, `--treasury-slash` – override percentages from the command line (accepts integers or decimals ≤1.0).
   - `--commit-window`, `--reveal-window` – customise validator windows using seconds or `1h`, `1d`, `1w` style suffixes.
   - `--min-stake`, `--job-stake` – supply token amounts (e.g. `7500.5`) or hex base units.
   - `--ens`, `--name-wrapper`, `--club-root`, `--agent-root`, `--validator-merkle`, `--agent-merkle` – override identity wiring with addresses or ENS names.
   - `--tax-uri`, `--tax-description`, `--with-tax`, `--no-tax` – control `TaxPolicy` deployment and metadata. When custom metadata is provided the script automatically calls `setPolicy(uri, text)` as the governance signer (it will impersonate on `hardhat`/`localhost` networks).
   - `--output <file>` – save a JSON deployment report with effective parameters and contract addresses.

3. The script deploys `Deployer.sol`, calls `deployDefaults` (or `deployDefaultsWithoutTaxPolicy` when `--no-tax` is supplied), prints module addresses, applies requested governance updates (including the optional tax-policy metadata) and verifies each contract on Etherscan.

   Example output:

   ```text
   Deployer deployed at: 0xDeployer
   JobRegistry: 0xRegistry
   StakeManager: 0xStake
   ...
   ```

## 2. Configure token, ENS roots and fees

The default run uses the mainnet `$AGIALPHA` address, a 5% protocol fee and 1% burn, and loads ENS data from `deployment-config/<network>.json`. Customise values with CLI flags or a config file instead of editing TypeScript:

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
    "validatorMerkleRoot": "0x5c...",
    "agentMerkleRoot": "0x00"
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

2. On `StakeManager`, `ValidationModule` and `CertificateNFT`, call
   `setJobRegistry(jobRegistry)`. `CertificateNFT` additionally checks that
   `JobRegistry.version()` equals `2`.

   ```solidity
   stakeManager.setJobRegistry(jobRegistry);
   validationModule.setJobRegistry(jobRegistry);
   certificateNFT.setJobRegistry(jobRegistry); // requires JobRegistry.version() == 2
   ```

3. Verify `ModulesUpdated` and `JobRegistrySet` events before allowing user funds.

For function parity with the legacy contract, compare calls against [v0-v2-function-map.md](legacy/v0-v2-function-map.md).

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
