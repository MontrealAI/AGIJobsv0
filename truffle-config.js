require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    mainnet: {
      provider: () =>
        new HDWalletProvider(
          process.env.MAINNET_PRIVATE_KEY,
          process.env.MAINNET_RPC_URL
        ),
      network_id: 1,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
    },
    sepolia: {
      provider: () =>
        new HDWalletProvider(
          process.env.SEPOLIA_PRIVATE_KEY || process.env.TESTNET_PRIVATE_KEY,
          process.env.SEPOLIA_RPC_URL
        ),
      network_id: 11155111,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
    },
  },
  compilers: {
    solc: {
      version: '0.8.25',
    },
  },
  plugins: ['truffle-plugin-verify'],
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY,
  },
};
