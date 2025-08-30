const { artifacts, network } = require("hardhat");
const { AGIALPHA } = require("../scripts/constants");

before(async function () {
  const artifact = await artifacts.readArtifact("contracts/legacy/MockERC20.sol:MockERC20");
  await network.provider.send("hardhat_setCode", [AGIALPHA, artifact.deployedBytecode]);
});
