const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry module version checks", function () {
  let owner, registry, v1, v2;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const Version = await ethers.getContractFactory(
      "contracts/v2/mocks/VersionMock.sol:VersionMock"
    );
    v1 = await Version.deploy(1);
    v2 = await Version.deploy(2);
  });

  it("reverts for mismatched validation module", async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await v2.getAddress(),
          await v1.getAddress(),
          await v1.getAddress(),
          await v1.getAddress(),
          await v1.getAddress(),
          ethers.ZeroAddress,
          []
        )
    ).to.be.revertedWith("Invalid validation module");
  });

  it("reverts for mismatched stake manager", async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await v1.getAddress(),
          await v2.getAddress(),
          await v1.getAddress(),
          await v1.getAddress(),
          await v1.getAddress(),
          ethers.ZeroAddress,
          []
        )
    ).to.be.revertedWith("Invalid stake manager");
  });

  it("reverts for mismatched reputation module", async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await v1.getAddress(),
          await v1.getAddress(),
          await v2.getAddress(),
          await v1.getAddress(),
          await v1.getAddress(),
          ethers.ZeroAddress,
          []
        )
    ).to.be.revertedWith("Invalid reputation module");
  });

  it("reverts for mismatched dispute module", async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await v1.getAddress(),
          await v1.getAddress(),
          await v1.getAddress(),
          await v2.getAddress(),
          await v1.getAddress(),
          ethers.ZeroAddress,
          []
        )
    ).to.be.revertedWith("Invalid dispute module");
  });

  it("reverts for mismatched certificate NFT", async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await v1.getAddress(),
          await v1.getAddress(),
          await v1.getAddress(),
          await v1.getAddress(),
          await v2.getAddress(),
          ethers.ZeroAddress,
          []
        )
    ).to.be.revertedWith("Invalid certificate NFT");
  });

  it("succeeds for matching versions", async function () {
    await registry
      .connect(owner)
      .setModules(
        await v1.getAddress(),
        await v1.getAddress(),
        await v1.getAddress(),
        await v1.getAddress(),
        await v1.getAddress(),
        ethers.ZeroAddress,
        []
      );
    expect(await registry.validationModule()).to.equal(await v1.getAddress());
  });
});
