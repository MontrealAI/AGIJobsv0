import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const cultureRegistryAddress = process.env.CULTURE_REGISTRY_ADDRESS;
  if (!cultureRegistryAddress) {
    throw new Error("CULTURE_REGISTRY_ADDRESS is required");
  }
  const registry = await ethers.getContractAt("CultureRegistry", cultureRegistryAddress);
  const tx = await registry.mintArtifact("book", "bafyseededbook", 0, []);
  await tx.wait();
  console.log("Seeded sample artifact");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
