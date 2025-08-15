const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DisputeModule module ether rejection", function () {
  let owner, registry, dispute;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    registry = await JobMock.deploy();
    await registry.waitForDeployment();
    const Dispute = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress
    );
    await dispute.waitForDeployment();
  });

  it("reverts on direct ether transfer", async () => {
    await expect(
      owner.sendTransaction({ to: await dispute.getAddress(), value: 1 })
    ).to.be.revertedWith("DisputeModule: no ether");
  });

  it("reverts on unknown calldata with value", async () => {
    await expect(
      owner.sendTransaction({
        to: await dispute.getAddress(),
        data: "0x12345678",
        value: 1,
      })
    ).to.be.revertedWith("DisputeModule: no ether");
  });

  it("reports tax exemption", async () => {
    expect(await dispute.isTaxExempt()).to.equal(true);
  });
});

