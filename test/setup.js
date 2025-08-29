const { ethers, network, artifacts } = require("hardhat");
const AGIALPHA = "0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA";

before(async () => {
  const artifact = await artifacts.readArtifact("contracts/legacy/MockERC20.sol:MockERC20");
  await network.provider.send("hardhat_setCode", [AGIALPHA, artifact.deployedBytecode]);
  const token = await ethers.getContractAt("contracts/legacy/MockERC20.sol:MockERC20", AGIALPHA);
  global.agialpha = token;
  const original = ethers.getContractFactory;
  ethers.getContractFactory = async (name, ...args) => {
    if (typeof name === "string" && name.includes("AGIALPHAToken")) {
      const factory = await original(name, ...args);
      factory.deploy = async () => token;
      return factory;
    }
    return original(name, ...args);
  };
});

module.exports = { AGIALPHA };
