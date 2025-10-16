import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  paths: {
    root: "../..",
    sources: "contracts/demo/alpha-agi-mark",
    tests: "test",
    cache: "cache/alpha-agi-mark",
    artifacts: "artifacts/alpha-agi-mark",
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 500,
      },
    },
  },
  paths: {
    root: ".",
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
  },
};

export default config;
