import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "hardhat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = process.env.AGIJOBS_GOV_CONFIG ?? path.join(__dirname, "..", "config", "multinational-governance.json");

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Configuration file not found at ${CONFIG_PATH}`);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  const [signer] = await ethers.getSigners();

  const owner = config.owner && config.owner !== ethers.ZeroAddress ? config.owner : signer.address;
  const pauserRole = config.pauserRole ?? ethers.ZeroHash;

  console.log(`[deploy] deploying GlobalGovernanceCouncil with owner ${owner}`);
  const factory = await ethers.getContractFactory("GlobalGovernanceCouncil");
  const contract = await factory.deploy(owner, pauserRole);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`[deploy] deployed at ${address}`);

  const output = {
    network: await signer.provider?.getNetwork(),
    deployer: signer.address,
    owner,
    pauserRole,
    contract: address,
    timestamp: Date.now()
  };

  const logDir = path.join(__dirname, "..", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, "deployment-latest.json"), JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("[deploy] failed", error);
  process.exitCode = 1;
});
