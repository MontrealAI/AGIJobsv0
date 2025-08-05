
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
    VRF_COORDINATOR,
    VRF_KEY_HASH,
    VRF_SUBSCRIPTION_ID,
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
    VRF_COORDINATOR,
  ]);
  await agiJobManagerV1.waitForDeployment();

  if (VRF_KEY_HASH) {
    const tx = await agiJobManagerV1.setVrfKeyHash(VRF_KEY_HASH);
    await tx.wait();
  }
  if (VRF_SUBSCRIPTION_ID) {
    const tx = await agiJobManagerV1.setVrfSubscriptionId(VRF_SUBSCRIPTION_ID);
    await tx.wait();
  }

  console.log(`AGIJobManagerV1 deployed to: ${agiJobManagerV1.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
