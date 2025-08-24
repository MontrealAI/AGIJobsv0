import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const addressesPath = join(__dirname, "..", "docs", "deployment-addresses.json");
  const addresses = JSON.parse(readFileSync(addressesPath, "utf8"));

  const registry = await ethers.getContractAt(
    "contracts/v2/JobRegistry.sol:JobRegistry",
    addresses.jobRegistry
  );
  const validation = await ethers.getContractAt(
    "contracts/v2/ValidationModule.sol:ValidationModule",
    addresses.validationModule
  );

  const agentRoot = process.env.AGENT_ROOT;
  const clubRoot = process.env.CLUB_ROOT;
  const agentMerkle = process.env.AGENT_MERKLE_ROOT;
  const validatorMerkle = process.env.VALIDATOR_MERKLE_ROOT;

  if (agentRoot || clubRoot) {
    const tx1 = await registry.setRootNodes(
      agentRoot || ethers.ZeroHash,
      clubRoot || ethers.ZeroHash
    );
    await tx1.wait();
    const tx2 = await validation.setRootNodes(
      agentRoot || ethers.ZeroHash,
      clubRoot || ethers.ZeroHash
    );
    await tx2.wait();
  }

  if (agentMerkle || validatorMerkle) {
    const tx1 = await registry.setMerkleRoots(
      agentMerkle || ethers.ZeroHash,
      validatorMerkle || ethers.ZeroHash
    );
    await tx1.wait();
    const tx2 = await validation.setMerkleRoots(
      agentMerkle || ethers.ZeroHash,
      validatorMerkle || ethers.ZeroHash
    );
    await tx2.wait();
  }

  console.log("Parameters updated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
