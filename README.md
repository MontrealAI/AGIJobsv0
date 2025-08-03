# AGIJob Manager v0

## Project Purpose
AGIJob Manager v0 is a foundational smart-contract component for the emerging Economy of AGI. It coordinates work between **AGI Agents** and **AGI Nodes**, using the $AGI utility token as the medium of exchange. Agents perform computational jobs, Nodes supply the processing power, and $AGI rewards flow through the system to fuel a decentralized network of autonomous services.

## Prerequisites
- **Node.js & npm** – install the latest LTS release of Node.js (which bundles the matching npm version).
- **Hardhat or Foundry** – choose either development toolkit and use its respective commands (`npx hardhat` or `forge`).
- **Solidity Compiler** – version ^0.8.23.
- **OpenZeppelin Contracts** – install the most recent `@openzeppelin/contracts` package.

## Installation
1. **Install Node.js LTS and npm**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
2. **Set up a development framework**
   - Hardhat
     ```bash
     npm install --save-dev hardhat
     npx hardhat init
     ```
   - Foundry
     ```bash
     curl -L https://foundry.paradigm.xyz | bash
     foundryup
     forge init
     ```
3. **Install dependencies**
   ```bash
   npm install solc@^0.8.23 @openzeppelin/contracts@latest
   ```

## Configuration
Store sensitive values in a local `.env` file, for example:

```bash
API_URL="https://your.rpc.provider"
PRIVATE_KEY="0xabc123..."
```
Load these values in your Hardhat or Foundry configuration to access networks and private accounts.

## Quick Start

1. **Compile**
   ```bash
   npx hardhat compile
   ```
2. **Deploy**
   ```bash
   npx hardhat run scripts/deploy.ts --network sepolia
   ```
   Configure your preferred public test network such as [Ethereum Sepolia](https://sepolia.etherscan.io) or [Base Sepolia](https://sepolia.basescan.org) in `hardhat.config.ts`.

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

## AGIJobManagerv0.sol Capabilities
- **Job assignments** – employers post jobs, Agents apply, validators confirm completion, and payouts are released.
- **Reputation tracking** – Agents build reputation from finished work which unlocks premium features and influences future opportunities.
- **NFT marketplace** – completed jobs can mint NFTs that are listed, purchased, or delisted using $AGI tokens.
- **Reward pool contributions** – participants can contribute $AGI to a communal pool; custom AGI types and payout percentages enable flexible reward schemes.

## The Economy of AGI
This contract sketches how jobs, reputation and value circulate in the broader "Economy of AGI." Nodes mint $AGI by supplying compute, Agents expend that token to access resources, and completed work emerges as NFTs or other digital goods. As these elements interact, they illustrate a self-sustaining marketplace where decentralized intelligence and tokenized incentives reinforce one another.

### Legal & Regulatory
$AGI is strictly a utility token. It is minted only when AGI Nodes contribute computational resources and is used to acquire products and services within the network. Holding $AGI tokens does not constitute an investment, and they confer no ownership, voting rights, or entitlement to profits. For full disclosures, see [AGIJobManagerv0.sol](AGIJobManagerv0.sol).

## Contributing
Contributions are welcome! To contribute:
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit your changes: `git commit -am 'Add new feature'`.
4. Push to your fork: `git push origin feature/your-feature`.
5. Open a pull request.

## Security
Please report security issues responsibly. Contact **security@agi.network** or open a private issue so we can address vulnerabilities quickly.

## License
Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

