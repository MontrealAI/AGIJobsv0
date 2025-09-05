import hre from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const path = join(__dirname, "..", "docs", "deployment-addresses.json");
  const addresses = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  const { ethers } = hre;
  const zero = ethers.ZeroAddress.toLowerCase();

  type Check = { getter: string; expected: string; };
  type ContractConfig = { address: string; abi: string[]; checks: Check[] };

  const configs: Record<string, ContractConfig> = {
    jobRegistry: {
      address: addresses.jobRegistry,
      abi: [
        "function stakeManager() view returns (address)",
        "function validationModule() view returns (address)",
        "function reputationEngine() view returns (address)",
        "function disputeModule() view returns (address)",
        "function certificateNFT() view returns (address)",
        "function taxPolicy() view returns (address)",
        "function feePool() view returns (address)",
        "function identityRegistry() view returns (address)",
      ],
      checks: [
        { getter: "stakeManager", expected: addresses.stakeManager },
        { getter: "validationModule", expected: addresses.validationModule },
        { getter: "reputationEngine", expected: addresses.reputationEngine },
        { getter: "disputeModule", expected: addresses.disputeModule },
        { getter: "certificateNFT", expected: addresses.certificateNFT },
        { getter: "taxPolicy", expected: addresses.taxPolicy },
        { getter: "feePool", expected: addresses.feePool },
        { getter: "identityRegistry", expected: addresses.identityRegistry },
      ],
    },
    stakeManager: {
      address: addresses.stakeManager,
      abi: [
        "function jobRegistry() view returns (address)",
        "function disputeModule() view returns (address)",
      ],
      checks: [
        { getter: "jobRegistry", expected: addresses.jobRegistry },
        { getter: "disputeModule", expected: addresses.disputeModule },
      ],
    },
    validationModule: {
      address: addresses.validationModule,
      abi: [
        "function jobRegistry() view returns (address)",
        "function stakeManager() view returns (address)",
        "function identityRegistry() view returns (address)",
      ],
      checks: [
        { getter: "jobRegistry", expected: addresses.jobRegistry },
        { getter: "stakeManager", expected: addresses.stakeManager },
        { getter: "identityRegistry", expected: addresses.identityRegistry },
      ],
    },
    disputeModule: {
      address: addresses.disputeModule,
      abi: [
        "function jobRegistry() view returns (address)",
        "function stakeManager() view returns (address)",
      ],
      checks: [
        { getter: "jobRegistry", expected: addresses.jobRegistry },
        { getter: "stakeManager", expected: addresses.stakeManager },
      ],
    },
    certificateNFT: {
      address: addresses.certificateNFT,
      abi: [
        "function jobRegistry() view returns (address)",
        "function stakeManager() view returns (address)",
      ],
      checks: [
        { getter: "jobRegistry", expected: addresses.jobRegistry },
        { getter: "stakeManager", expected: addresses.stakeManager },
      ],
    },
    feePool: {
      address: addresses.feePool,
      abi: ["function stakeManager() view returns (address)"],
      checks: [{ getter: "stakeManager", expected: addresses.stakeManager }],
    },
    platformRegistry: {
      address: addresses.platformRegistry,
      abi: [
        "function stakeManager() view returns (address)",
        "function reputationEngine() view returns (address)",
      ],
      checks: [
        { getter: "stakeManager", expected: addresses.stakeManager },
        { getter: "reputationEngine", expected: addresses.reputationEngine },
      ],
    },
    jobRouter: {
      address: addresses.jobRouter,
      abi: ["function platformRegistry() view returns (address)"],
      checks: [
        { getter: "platformRegistry", expected: addresses.platformRegistry },
      ],
    },
    platformIncentives: {
      address: addresses.platformIncentives,
      abi: [
        "function stakeManager() view returns (address)",
        "function platformRegistry() view returns (address)",
        "function jobRouter() view returns (address)",
      ],
      checks: [
        { getter: "stakeManager", expected: addresses.stakeManager },
        { getter: "platformRegistry", expected: addresses.platformRegistry },
        { getter: "jobRouter", expected: addresses.jobRouter },
      ],
    },
    systemPause: {
      address: addresses.systemPause,
      abi: [
        "function jobRegistry() view returns (address)",
        "function stakeManager() view returns (address)",
        "function validationModule() view returns (address)",
        "function disputeModule() view returns (address)",
        "function platformRegistry() view returns (address)",
        "function feePool() view returns (address)",
        "function reputationEngine() view returns (address)",
      ],
      checks: [
        { getter: "jobRegistry", expected: addresses.jobRegistry },
        { getter: "stakeManager", expected: addresses.stakeManager },
        { getter: "validationModule", expected: addresses.validationModule },
        { getter: "disputeModule", expected: addresses.disputeModule },
        { getter: "platformRegistry", expected: addresses.platformRegistry },
        { getter: "feePool", expected: addresses.feePool },
        { getter: "reputationEngine", expected: addresses.reputationEngine },
      ],
    },
  };

  let failed = false;

  for (const [name, cfg] of Object.entries(configs)) {
    const addr = cfg.address?.toLowerCase();
    if (!addr || addr === zero) {
      console.log(`Skipping ${name}: no address`);
      continue;
    }
    const code = await ethers.provider.getCode(addr);
    if (code === "0x") {
      console.log(`Skipping ${name}: not deployed at ${addr}`);
      continue;
    }
    const contract = new ethers.Contract(addr, cfg.abi, ethers.provider);
    for (const check of cfg.checks) {
      const expected = (check.expected || zero).toLowerCase();
      const actual = ((await contract[check.getter]()) as string).toLowerCase();
      if (actual !== expected) {
        failed = true;
        console.error(
          `${name}.${check.getter} => ${actual} (expected ${expected})`
        );
      } else {
        console.log(`${name}.${check.getter} OK`);
      }
    }
  }

  if (failed) {
    console.error("\nModule wiring does not match deployment summary.");
    process.exit(1);
  } else {
    console.log("\nAll module wiring matches deployment summary.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
