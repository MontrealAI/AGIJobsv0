
import { ethers } from "hardhat";

async function main() {
  const {
    AGI_TOKEN_ADDRESS,
    BASE_IPFS_URL,
    ENS_ADDRESS,
    NAME_WRAPPER_ADDRESS,
    CLUB_ROOT_NODE,
    AGENT_ROOT_NODE,
    VALIDATOR_MERKLE_ROOT,
    AGENT_MERKLE_ROOT,
  } = process.env;

  const agiJobManagerV1 = await ethers.deployContract("AGIJobManagerV1", [
    AGI_TOKEN_ADDRESS,
    BASE_IPFS_URL,
    ENS_ADDRESS,
    NAME_WRAPPER_ADDRESS,
    CLUB_ROOT_NODE,
    AGENT_ROOT_NODE,
    VALIDATOR_MERKLE_ROOT,
    AGENT_MERKLE_ROOT,
  ]);
  await agiJobManagerV1.waitForDeployment();

  console.log(`AGIJobManagerV1 deployed to: ${agiJobManagerV1.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
