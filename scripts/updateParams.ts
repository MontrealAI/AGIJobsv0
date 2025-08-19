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

  if (agentRoot) {
    const tx = await registry.setAgentRootNode(agentRoot);
    await tx.wait();
  }

  if (clubRoot || agentRoot) {
    const currentAgentRoot = agentRoot || (await validation.agentRootNode());
    const currentClubRoot = clubRoot || (await validation.clubRootNode());
    const tx = await validation.setENSRoots(currentAgentRoot, currentClubRoot);
    await tx.wait();
  }

  if (agentMerkle) {
    const tx = await registry.setAgentMerkleRoot(agentMerkle);
    await tx.wait();
  }

  if (agentMerkle || validatorMerkle) {
    const currentAgentMerkle = agentMerkle || (await validation.agentMerkleRoot());
    const currentValidatorMerkle =
      validatorMerkle || (await validation.validatorMerkleRoot());
    const tx = await validation.setMerkleRoots(
      currentAgentMerkle,
      currentValidatorMerkle
    );
    await tx.wait();
  }

  console.log("Parameters updated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
