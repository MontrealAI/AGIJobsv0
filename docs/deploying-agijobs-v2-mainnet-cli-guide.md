# Deploying AGIJobs v2 to Ethereum Mainnet (CLI Guide)

This guide walks through deploying the production AGIJobs v2 contract suite to Ethereum mainnet using the Hardhat command-line interface. It assumes the canonical `$AGIALPHA` token and ENS-based identity policy.

## Prerequisites

- **Node & npm** – install Node.js 20.x and npm 10+. The repo supplies an `.nvmrc` to match the expected Node version.
- **Repository** – clone `MontrealAI/AGIJobsv0` and install dependencies:
  ```bash
  git clone https://github.com/MontrealAI/AGIJobsv0.git
  cd AGIJobsv0
  npm install
  ```
- **Ethereum access** – export RPC and deployer key for mainnet:
  ```bash
  export MAINNET_RPC_URL="https://mainnet.infura.io/v3/<id>"
  export MAINNET_PRIVATE_KEY="0x..."
  export ETHERSCAN_API_KEY="<key>"
  ```
- **Governance address** – multisig or timelock that will own the system.
- **Token & ENS** – `$AGIALPHA` lives at `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`. Ensure you control `agi.eth` if enforcing ENS subdomains.

## 1. Deploy

Run the one-shot script which deploys and wires all modules. Pass your governance address and optional `--no-tax` to skip the tax policy module.

```bash
npx hardhat run scripts/v2/deployDefaults.ts --network mainnet --governance <GOVERNANCE_ADDRESS>
```

The script compiles contracts, deploys `Deployer.sol`, and executes `deployDefaults` (or `deployDefaultsWithoutTaxPolicy`). Deployment addresses and verification status are printed to the console.

## 2. Verify and record

- All contracts are automatically verified on Etherscan using `ETHERSCAN_API_KEY`. If any verification fails, rerun manually:
  ```bash
  npx hardhat verify --network mainnet <ADDRESS> <constructor args>
  ```
- Save the console output and update `docs/deployment-addresses.json` or your own records with the returned addresses.

## 3. Post‑deployment checks

1. **Ownership** – confirm each module is owned by your governance contract. Transfer if needed:
   ```bash
   npx hardhat --network mainnet call <Contract> transferOwnership <GOVERNANCE_ADDRESS>
   ```
2. **Wiring** – run the wiring check to ensure every module references the correct addresses:
   ```bash
   npm run verify:wiring
   ```
3. **Pause safety** – deploy `SystemPause` (if not already) and test `pauseAll()`/`unpauseAll()` via the governance address.
4. **Parameter tuning** – adjust fees or burn percentages with `JobRegistry.setFeePct` and `FeePool.setBurnPct` as required.

## 4. Launch readiness

- Test the full job lifecycle on a testnet or with small mainnet values before inviting users.
- Distribute ENS subdomains (`*.agent.agi.eth` for agents, `*.club.agi.eth` for validators) or relax identity rules via `IdentityRegistry` settings.
- Archive deployment transactions and verified source links for future audits.

## References

- [hardhat.config.js](../hardhat.config.js)
- [scripts/v2/deployDefaults.ts](../scripts/v2/deployDefaults.ts)
- [v2-deployment-and-operations.md](v2-deployment-and-operations.md)
- [system-pause.md](system-pause.md)
- [ens-identity-setup.md](ens-identity-setup.md)
