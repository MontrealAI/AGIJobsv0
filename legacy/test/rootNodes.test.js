const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ENS root node and Merkle root setters", function () {
  let owner, other, registry, validation;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory(
      "contracts/JobRegistry.sol:JobRegistry"
    );
    registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      "contracts/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy();
    await validation.waitForDeployment();
  });

  it("restricts agent root updates to owner", async () => {
    const node = ethers.id("node");
    const root = ethers.id("root");

    await expect(registry.connect(other).setAgentRootNode(node))
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(other.address);

    await expect(registry.setAgentRootNode(node))
      .to.emit(registry, "AgentRootNodeUpdated")
      .withArgs(node);

    await expect(registry.connect(other).setAgentMerkleRoot(root))
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(other.address);

    await expect(registry.setAgentMerkleRoot(root))
      .to.emit(registry, "AgentMerkleRootUpdated")
      .withArgs(root);
  });

  it("restricts validator root updates to owner", async () => {
    const node = ethers.id("node");
    const root = ethers.id("root");

    await expect(validation.connect(other).setClubRootNode(node))
      .to.be.revertedWithCustomError(validation, "OwnableUnauthorizedAccount")
      .withArgs(other.address);

    await expect(validation.setClubRootNode(node))
      .to.emit(validation, "ClubRootNodeUpdated")
      .withArgs(node);

    await expect(validation.connect(other).setValidatorMerkleRoot(root))
      .to.be.revertedWithCustomError(validation, "OwnableUnauthorizedAccount")
      .withArgs(other.address);

    await expect(validation.setValidatorMerkleRoot(root))
      .to.emit(validation, "ValidatorMerkleRootUpdated")
      .withArgs(root);
  });
});
