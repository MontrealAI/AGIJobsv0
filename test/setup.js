const { artifacts, network } = require("hardhat");
const { AGIALPHA } = require("../scripts/constants");

let snapshotId;

before(async function () {
  const artifact = await artifacts.readArtifact(
    "contracts/legacy/MockERC20.sol:MockERC20"
  );
  await network.provider.send("hardhat_setCode", [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);
  snapshotId = await network.provider.send("evm_snapshot");
});

beforeEach(async function () {
  await network.provider.send("evm_revert", [snapshotId]);
  snapshotId = await network.provider.send("evm_snapshot");
});
