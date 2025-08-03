# AGIJob Manager v0
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![CI](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)

> **Audit Status:** _Unaudited – use at your own risk._

## Project Purpose
AGIJob Manager v0 is a foundational smart-contract component for the emerging Economy of AGI. It coordinates work between **AGI Agents** and **AGI Nodes**, using the $AGI utility token as the medium of exchange. Agents perform computational jobs, Nodes supply the processing power, and $AGI rewards flow through the system to fuel a decentralized network of autonomous services.

## Table of Contents
- [Project Purpose](#project-purpose)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Example interactions](#example-interactions)
- [Testing](#testing)
- [Linting](#linting)
- [AGIJobManagerv0.sol Capabilities](#agijobmanagerv0sol-capabilities)
- [The Economy of AGI](#the-economy-of-agi)
- [Legal & Regulatory](#legal--regulatory)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [References](#references)
- [License](#license)

## Prerequisites
- **Node.js & npm** – Node.js ≥ 22.x LTS (bundled with a matching npm version).
- **Hardhat 2.26.1** or **Foundry** – choose either development toolkit and use its respective commands (`npx hardhat` or `forge`).
- **Solidity Compiler** – version 0.8.30.
- **OpenZeppelin Contracts** – version 5.4.0.

## Installation
1. **Install Node.js 22.x LTS and npm**
   Using [`nvm`](https://github.com/nvm-sh/nvm):

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   source ~/.nvm/nvm.sh
   nvm install 22
   ```

   > For platform-specific installation details, see the [official Node.js documentation](https://nodejs.org/en/download/package-manager).
2. **Set up a development framework**
   - Hardhat
     ```bash
     npm install --save-dev hardhat@2.26.1
     npm install --save-dev @nomicfoundation/hardhat-toolbox@6.1.0
     npx hardhat init
     ```
     *`@nomicfoundation/hardhat-toolbox` bundles the `hardhat-ethers` plugin required by [`scripts/deploy.ts`](scripts/deploy.ts).*
   - Foundry
     ```bash
     curl -L https://foundry.paradigm.xyz | bash
     foundryup
     forge init
     ```
3. **Install dependencies**
   ```bash
   npm install solc@0.8.30 @openzeppelin/contracts@5.4.0
   ```

## Configuration
Set the following environment variables in a local `.env` file so deployment tools can access your RPC endpoint and signer:

```bash
API_URL="https://your.rpc.provider"      # RPC endpoint for the target chain
PRIVATE_KEY="0xabc123..."                # Private key of the deploying wallet
# optional: only needed for contract verification
ETHERSCAN_API_KEY="your-etherscan-api-key"
```

Remember to add `.env` to your `.gitignore` and never commit private keys.

```gitignore
.env
```

### Hardhat
Load these variables in `hardhat.config.ts`:

```ts
import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

dotenvConfig();

const config: HardhatUserConfig = {
  networks: {
    sepolia: {
      url: process.env.API_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
```

### Foundry
Example `foundry.toml` network configuration:

```toml
[rpc_endpoints]
sepolia = "${API_URL}"

[profile.default]
private_key = "${PRIVATE_KEY}"
```


## Quick Start

1. **Compile**
   ```bash
   npx hardhat compile
   ```
2. **Deploy**
   ```bash
   # Hardhat
   npx hardhat run scripts/deploy.ts --network sepolia

   # Foundry
   forge create AGIJobManagerv0.sol:AGIJobManagerv0 --rpc-url $API_URL --private-key $PRIVATE_KEY
   ```
   Configure your preferred public test network such as [Ethereum Sepolia](https://sepolia.etherscan.io) or [Base Sepolia](https://sepolia.basescan.org) in your Hardhat or Foundry configuration files.

3. **Verify on Etherscan**
   ```bash
   npx hardhat verify --network sepolia <DEPLOYED_CONTRACT_ADDRESS>
   ```
   Replace `<DEPLOYED_CONTRACT_ADDRESS>` with the address returned from deployment and ensure `ETHERSCAN_API_KEY` is set in your environment.

#### Foundry

```bash
forge verify-contract <DEPLOYED_CONTRACT_ADDRESS> AGIJobManagerv0 --chain sepolia --etherscan-api-key $ETHERSCAN_API_KEY
```

Set the `ETHERSCAN_API_KEY` (or a network-specific variant such as `SEPOLIA_ETHERSCAN_API_KEY`) as described in the [Foundry verification documentation](https://book.getfoundry.sh/reference/forge/verify-contract) to allow Foundry to authenticate with the block explorer API.

### Example interactions

- **List a job**
  ```ts
  await agiJobManager.createJob(
    "ipfs://Qm...",
    ethers.parseUnits("10", 18),
    7 * 24 * 60 * 60,
    "Translate article"
  );
  ```
- **Submit work**
  ```ts
  await agiJobManager.requestJobCompletion(jobId, "ipfs://Qm...result");
  ```
- **Verify ownership when applying**
  ```ts
  await agiJobManager.applyForJob(jobId, "alice", proof); // emits OwnershipVerified
  ```
- **Manage NFTs**
  ```ts
  await agiJobManager.listNFT(tokenId, ethers.parseUnits("50", 18));
  await agiJobManager.purchaseNFT(tokenId);
  await agiJobManager.delistNFT(tokenId);
  ```
 
## Testing

Run the test suite with either Hardhat or Foundry:

```bash
npx hardhat test
forge test
```

## Linting

Ensure code quality with linting tools:

- `solhint` for Solidity contracts
- `eslint` for TypeScript or JavaScript

```bash
npx solhint 'contracts/**/*.sol'
npx eslint .
```

## AGIJobManagerv0.sol Capabilities
- **Job assignments** – employers post jobs, Agents apply, validators confirm completion, and payouts are released.
- **Reputation tracking** – Agents build reputation from finished work which unlocks premium features and influences future opportunities.
- **NFT marketplace** – completed jobs can mint NFTs that are listed, purchased, or delisted using $AGI tokens.
- **Reward pool contributions** – participants can contribute $AGI to a communal pool; custom AGI types and payout percentages enable flexible reward schemes.

## The Economy of AGI
This contract sketches how jobs, reputation and value circulate in the broader "Economy of AGI." Nodes mint $AGI by supplying compute, Agents expend that token to access resources, and completed work emerges as NFTs or other digital goods. As these elements interact, they illustrate a self-sustaining marketplace where decentralized intelligence and tokenized incentives reinforce one another.

### Legal & Regulatory
$AGI is strictly a utility token. It is minted only when AGI Nodes contribute computational resources and is used to acquire products and services within the network. Holding $AGI tokens does not constitute an investment, and they confer no ownership, voting rights, or entitlement to profits. For full disclosures, see [AGIJobManagerv0.sol](AGIJobManagerv0.sol).

## Roadmap

- **Additional contracts** – introduce job escrow, dispute resolution, and staking mechanisms.
- **Integration tools** – provide SDKs, CLI utilities, and ENS-powered discovery helpers.
- **Cross-chain interoperability** – explore bridges and messaging layers for multi-network deployments.
- **Governance** – enable token‑holder proposals and voting for protocol upgrades.

## Contributing
Contributions are welcome! To contribute:
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit your changes: `git commit -am 'Add new feature'`.
4. Push to your fork: `git push origin feature/your-feature`.
5. Open a pull request.

## Security

**Audit Status:** Unaudited – use at your own risk.

This project has not undergone a formal security audit. Before any production deployment, commission an independent third-party security review.

Please report security issues responsibly. Contact **security@agi.network** or open a private issue so we can address vulnerabilities quickly.

## References

- [AGI.eth](https://agi.eth.limo) – official resources and updates from the AGI ecosystem.
- [Ethereum Name Service (ENS)](https://ens.domains/) – decentralized naming for wallets and contracts.
- [ERC-20 Token Standard](https://eips.ethereum.org/EIPS/eip-20) – fungible token specification.
- [ERC-721 Non-Fungible Token Standard](https://eips.ethereum.org/EIPS/eip-721) – NFT specification used for job artifacts.
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/) – audited building blocks for Ethereum development.

## License
Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

