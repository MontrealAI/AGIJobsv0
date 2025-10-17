import { artifacts, ethers, network } from "hardhat";
import { AGIALPHA } from "../../../scripts/constants";

let stubPromise: Promise<void> | undefined;
const LOCAL_CHAIN_IDS = new Set<bigint>([31337n, 1337n]);
const LOCAL_NETWORK_NAMES = new Set(["hardhat", "localhost", "anvil"]);

async function needsStub(): Promise<boolean> {
  const code = await ethers.provider.getCode(AGIALPHA);
  return !code || code === "0x";
}

export async function ensureAgialphaStub(): Promise<void> {
  if (stubPromise) {
    return stubPromise;
  }
  stubPromise = (async () => {
    if (!(await needsStub())) {
      return;
    }
    const { chainId } = await ethers.provider.getNetwork();
    if (!LOCAL_CHAIN_IDS.has(chainId) && !LOCAL_NETWORK_NAMES.has(network.name)) {
      throw new Error(
        `No contract found at $AGIALPHA (${AGIALPHA}) on network ${network.name} (chainId ${chainId}). ` +
          "Deploy against a network with the canonical token or stub it manually."
      );
    }
    const artifact = await artifacts.readArtifact("contracts/test/MockERC20.sol:MockERC20");
    await network.provider.send("hardhat_setCode", [AGIALPHA, artifact.deployedBytecode]);
  })();
  return stubPromise;
}
