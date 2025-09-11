# Deploying AGIJobs v2 to Ethereum Mainnet (CLI Guide)

This guide walks through deploying the production AGIJobs v2 contract suite to Ethereum mainnet using the Truffle command-line interface. The provided migration deploys and wires every module in one transaction, assuming the canonical `$AGIALPHA` token and ENS-based identity policy.

## Prerequisites

- **Node & npm** – install Node.js 20.x and npm 10+. The repo supplies an `.nvmrc` to match the expected Node version.
- **Repository** – clone `MontrealAI/AGIJobsv0` and install dependencies plus Truffle tooling:
  ```bash
  git clone https://github.com/MontrealAI/AGIJobsv0.git
  cd AGIJobsv0
  npm install
  npm install --save-dev truffle @truffle/hdwallet-provider truffle-plugin-verify
  ```
- **Environment** – export mainnet RPC, deployer key, governance address and Etherscan key:
  ```bash
  export MAINNET_RPC_URL="https://mainnet.infura.io/v3/<id>"
  export MAINNET_PRIVATE_KEY="0x..."
  export GOVERNANCE_ADDRESS="0x<multisig_or_timelock>"
  export ETHERSCAN_API_KEY="<key>"
  ```
- **Token & ENS** – `$AGIALPHA` lives at `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`. Ensure you control `agi.eth` if enforcing ENS subdomains.

## 1. Compile

Truffle uses `truffle-config.js` and the migration at `migrations/2_deploy_agijobs_v2.js`.

```bash
npx truffle compile
```

## 2. Deploy

Run the migration to deploy and wire all modules. By default it uses a 5% protocol fee and burn and includes the TaxPolicy module. Set `NO_TAX=1` to omit it or override economics with `FEE_PCT` and `BURN_PCT`.

```bash
npx truffle migrate --network mainnet
```

The script prints the address of every module (StakeManager, JobRegistry, ValidationModule, ReputationEngine, DisputeModule, CertificateNFT, PlatformRegistry, JobRouter, PlatformIncentives, FeePool, [TaxPolicy,] IdentityRegistry and SystemPause). Save this output.

## 3. Verify

If `ETHERSCAN_API_KEY` is set, contracts can be verified immediately:

```bash
npx truffle run verify Deployer StakeManager JobRegistry ValidationModule ReputationEngine DisputeModule CertificateNFT PlatformRegistry JobRouter PlatformIncentives FeePool IdentityRegistry SystemPause --network mainnet
```

Include `TaxPolicy` in the list if it was deployed.

## 4. Post‑deployment checks

1. **Ownership** – confirm all modules are owned by `GOVERNANCE_ADDRESS`. Transfer any stragglers with `transferOwnership`.
2. **Pause safety** – the `SystemPause` contract allows pausing and resuming all modules; test `pauseAll()`/`unpauseAll()` via governance.
3. **Wiring** – run `npm run verify:wiring` to ensure addresses are correctly linked.
4. **Parameter tuning** – adjust protocol fee and burn percentages through governance calls on `JobRegistry` and `FeePool` as needed.

## References

- [truffle-config.js](../truffle-config.js)
- [migrations/2_deploy_agijobs_v2.js](../migrations/2_deploy_agijobs_v2.js)
- [contracts/v2/Deployer.sol](../contracts/v2/Deployer.sol)
- [v2-deployment-and-operations.md](v2-deployment-and-operations.md)
- [system-pause.md](system-pause.md)
