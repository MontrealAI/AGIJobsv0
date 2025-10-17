import fs from "fs";
import path from "path";
import { artifacts, ethers } from "hardhat";

const HUBS_FILE = path.join(__dirname, "../config/hubs.mainnet.json");
const AGIALPHA = "0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA";
const TOKEN_ARTIFACT = "contracts/test/AGIALPHAToken.sol:AGIALPHAToken";

async function ensureAgialpha(owner: string) {
  const artifact = await artifacts.readArtifact(TOKEN_ARTIFACT);
  await ethers.provider.send("hardhat_setCode", [AGIALPHA, artifact.deployedBytecode]);
  const ownerSlot = ethers.toBeHex(5, 32);
  const ownerValue = ethers.zeroPadValue(owner, 32);
  await ethers.provider.send("hardhat_setStorageAt", [AGIALPHA, ownerSlot, ownerValue]);
  return ethers.getContractAt(artifact.abi, AGIALPHA, await ethers.getSigner(owner));
}

async function main() {
  const hubs = JSON.parse(fs.readFileSync(HUBS_FILE, "utf8"));
  const [employer] = await ethers.getSigners();
  const token = await ensureAgialpha(employer.address);
  await (await token.mint(employer.address, ethers.parseEther("1000"))).wait();

  for (const hubId of Object.keys(hubs)) {
    const hub = hubs[hubId];
    const reward = ethers.parseEther("1");
    const registryAddress = hub.addresses?.JobRegistry;
    if (!registryAddress || registryAddress === ethers.ZeroAddress) continue;
    const jobRegistry = await ethers.getContractAt(
      "contracts/v2/JobRegistry.sol:JobRegistry",
      registryAddress,
      employer,
    );
    await (
      await token.connect(employer).approve(registryAddress, reward)
    ).wait();
    const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const specHash = ethers.id(`seed-${hubId}`);
    const uri = `ipfs://mesh/seed/${hubId}`;
    const tx = await jobRegistry.createJob(reward, deadline, specHash, uri);
    await tx.wait();
    console.log(`Seeded job on ${hub.label || hubId}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
