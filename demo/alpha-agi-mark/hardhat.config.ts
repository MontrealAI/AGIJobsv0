import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";

const isCi = process.env.CI === "true";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  paths: {
    root: "./",
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: isCi ? 240000 : 120000,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    showTimeSpent: true,
    noColors: isCi,
    outputFile: isCi ? "../reports/demo-alpha-agi-mark/gas-report.txt" : undefined,
  },
  typechain: {
    outDir: "./typechain-types",
    target: "ethers-v6",
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: false,
    },
  },
};

export default config;
