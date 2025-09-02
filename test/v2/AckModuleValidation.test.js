const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry ack module validation", function () {
  let owner, registry, good, goodAck, badAck;

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
    good = await Version.deploy(2);
    const AckStub = await ethers.getContractFactory(
      "contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub"
    );
    goodAck = await AckStub.deploy(ethers.ZeroAddress);
    const AckRevert = await ethers.getContractFactory(
      "contracts/v2/mocks/JobRegistryAckRevert.sol:JobRegistryAckRevert"
    );
    badAck = await AckRevert.deploy();
  });

  it("reverts when ack module lacks acknowledgeFor", async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          [await good.getAddress()]
        )
    ).to.be.revertedWithCustomError(registry, "InvalidAckModule");
  });

  it("reverts when ack module acknowledgeFor reverts", async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          [await badAck.getAddress()]
        )
    ).to.be.revertedWithCustomError(registry, "InvalidAckModule");
  });

  it("accepts valid ack module", async function () {
    await registry
      .connect(owner)
      .setModules(
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        [await goodAck.getAddress()]
      );
    expect(
      await registry.acknowledgers(await goodAck.getAddress())
    ).to.equal(true);
  });
});
